//! Cutting an MPEG-TS segment down to its first video frame.
//!
//! The player's seek-bar storyboard needs one picture per segment, and an HLS segment opens with
//! a keyframe: SPS, PPS and an IDR picture in the first video PES. That frame is typically the
//! first ~15% of the segment. Cancelling a fetch in the browser does not save those bytes on a
//! fast link — the rest of the segment is already in flight by the time the frame is parsed —
//! so the cut happens here, next to the CDN, and the client receives only the prefix it decodes.
//!
//! The output is the segment's own bytes up to the packet where the second video PES begins: a
//! truncated but valid transport stream, so the client parses it exactly as it would a full one.

const TS: usize = 188;
/// A first frame bigger than this is not a thumbnail worth fetching.
pub const MAX_PREFIX: usize = 1_500_000;
/// Sync has to appear quickly; disguise headers in front of TS data are a few hundred bytes.
const MAX_SYNC_SEARCH: usize = 64 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub enum Cut {
    /// Need more bytes.
    More,
    /// The first video frame ends at this offset; send `buf[..n]`.
    At(usize),
    /// Not something this can cut (not TS, no H.264, frame too large).
    Unsupported(&'static str),
}

#[derive(Default)]
pub struct KeyframeCutter {
    sync: Option<usize>,
    next: usize,
    pmt_pid: Option<u16>,
    video_pid: Option<u16>,
    in_frame: bool,
}

fn find_sync(b: &[u8]) -> Option<usize> {
    (0..b.len().saturating_sub(TS * 2)).find(|&o| b[o] == 0x47 && b[o + TS] == 0x47 && b[o + TS * 2] == 0x47)
}

impl KeyframeCutter {
    /// Feed the whole buffer read so far; packets already examined are not re-read.
    pub fn scan(&mut self, buf: &[u8]) -> Cut {
        if self.sync.is_none() {
            match find_sync(buf) {
                Some(o) => {
                    self.sync = Some(o);
                    self.next = o;
                }
                None if buf.len() > MAX_SYNC_SEARCH => return Cut::Unsupported("not_ts"),
                None => return Cut::More,
            }
        }

        while self.next + TS <= buf.len() {
            let pos = self.next;
            let p = &buf[pos..pos + TS];
            if p[0] != 0x47 {
                return Cut::Unsupported("ts_desync");
            }
            let pusi = p[1] & 0x40 != 0;
            let pid = (u16::from(p[1] & 0x1f) << 8) | u16::from(p[2]);
            let afc = (p[3] >> 4) & 3;

            if afc & 1 != 0 {
                let mut i = 4;
                if afc & 2 != 0 {
                    i += 1 + p[4] as usize;
                }
                if i < TS {
                    if pid == 0 && pusi {
                        let t = i + 1 + p[i] as usize;
                        if t + 12 <= TS {
                            self.pmt_pid = Some((u16::from(p[t + 10] & 0x1f) << 8) | u16::from(p[t + 11]));
                        }
                    } else if Some(pid) == self.pmt_pid && pusi && self.video_pid.is_none() {
                        if let Some(cut) = self.read_pmt(p, i) {
                            return cut;
                        }
                    } else if Some(pid) == self.video_pid && pusi {
                        if self.in_frame {
                            return Cut::At(pos);
                        }
                        self.in_frame = true;
                    }
                }
            }

            self.next += TS;
            if self.next > MAX_PREFIX {
                return Cut::Unsupported("frame_too_large");
            }
        }
        Cut::More
    }

    fn read_pmt(&mut self, p: &[u8], i: usize) -> Option<Cut> {
        let t = i + 1 + p[i] as usize;
        if t + 12 > TS {
            return None;
        }
        let section_len = (usize::from(p[t + 1] & 0x0f) << 8) | usize::from(p[t + 2]);
        let info_len = (usize::from(p[t + 10] & 0x0f) << 8) | usize::from(p[t + 11]);
        let end = (t + 3 + section_len).saturating_sub(4).min(TS);
        let mut q = t + 12 + info_len;
        while q + 5 <= end {
            let stream_type = p[q];
            let es_pid = (u16::from(p[q + 1] & 0x1f) << 8) | u16::from(p[q + 2]);
            let es_info = (usize::from(p[q + 3] & 0x0f) << 8) | usize::from(p[q + 4]);
            match stream_type {
                0x1b => {
                    self.video_pid = Some(es_pid);
                    return None;
                }
                0x24 => return Some(Cut::Unsupported("hevc")),
                _ => q += 5 + es_info,
            }
        }
        None
    }

    /// The stream ended before a second frame began: everything read is the first frame.
    pub fn finish(&self, len: usize) -> Cut {
        if self.in_frame {
            Cut::At(len)
        } else {
            Cut::Unsupported("no_video")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VIDEO: u16 = 256;
    const AUDIO: u16 = 257;
    const PMT: u16 = 4096;

    fn packet(pid: u16, pusi: bool, payload: &[u8]) -> Vec<u8> {
        let mut p = vec![0xffu8; TS];
        p[0] = 0x47;
        p[1] = (if pusi { 0x40 } else { 0 }) | ((pid >> 8) as u8 & 0x1f);
        p[2] = pid as u8;
        let room = 184;
        let n = payload.len().min(room);
        if n == room {
            p[3] = 0x10;
            p[4..].copy_from_slice(&payload[..room]);
        } else {
            let af = room - n - 1;
            p[3] = 0x30;
            p[4] = af as u8;
            if af > 0 {
                p[5] = 0;
            }
            p[5 + af..].copy_from_slice(&payload[..n]);
        }
        p
    }

    fn segment(video_type: u8) -> (Vec<u8>, usize) {
        let mut out = Vec::new();
        out.extend(packet(0, true, &[0, 0, 0xb0, 13, 0, 1, 0xc1, 0, 0, 0, 1, 0xe0 | (PMT >> 8) as u8, PMT as u8, 0, 0, 0, 0]));
        out.extend(packet(PMT, true, &[
            0, 2, 0xb0, 23, 0, 1, 0xc1, 0, 0, 0xe1, 0, 0xf0, 0,
            0x0f, 0xe0 | (AUDIO >> 8) as u8, AUDIO as u8, 0xf0, 0,
            video_type, 0xe0 | (VIDEO >> 8) as u8, VIDEO as u8, 0xf0, 0,
            0, 0, 0, 0,
        ]));
        out.extend(packet(AUDIO, true, &[0, 0, 1, 0xc0]));
        out.extend(packet(VIDEO, true, &[0, 0, 1, 0xe0, 0, 0, 0x80, 0, 0, 0, 0, 0, 1, 0x65]));
        for _ in 0..5 {
            out.extend(packet(VIDEO, false, &[7u8; 184]));
            out.extend(packet(AUDIO, false, &[1, 2, 3]));
        }
        let cut = out.len();
        out.extend(packet(VIDEO, true, &[0, 0, 1, 0xe0, 0, 0, 0x80, 0, 0, 0, 0, 0, 1, 0x41]));
        for _ in 0..40 {
            out.extend(packet(VIDEO, false, &[9u8; 184]));
        }
        (out, cut)
    }

    #[test]
    fn cuts_where_the_second_video_frame_begins() {
        let (seg, cut) = segment(0x1b);
        assert_eq!(KeyframeCutter::default().scan(&seg), Cut::At(cut));
    }

    #[test]
    fn works_when_bytes_arrive_in_pieces() {
        let (seg, cut) = segment(0x1b);
        let mut cutter = KeyframeCutter::default();
        let mut result = Cut::More;
        for end in (100..=seg.len()).step_by(333) {
            result = cutter.scan(&seg[..end]);
            if result != Cut::More {
                break;
            }
        }
        assert_eq!(result, Cut::At(cut));
    }

    #[test]
    fn keeps_a_disguise_header_in_front_of_the_stream() {
        let (seg, cut) = segment(0x1b);
        let mut disguised = vec![0x89, b'P', b'N', b'G'];
        disguised.resize(120, 0);
        disguised.extend(&seg);
        assert_eq!(KeyframeCutter::default().scan(&disguised), Cut::At(cut + 120));
    }

    #[test]
    fn declines_hevc_and_non_ts() {
        let (seg, _) = segment(0x24);
        assert_eq!(KeyframeCutter::default().scan(&seg), Cut::Unsupported("hevc"));
        assert_eq!(KeyframeCutter::default().scan(&vec![7u8; 70_000]), Cut::Unsupported("not_ts"));
    }

    #[test]
    fn a_stream_that_ends_mid_frame_is_the_frame() {
        let (seg, cut) = segment(0x1b);
        let mut cutter = KeyframeCutter::default();
        assert_eq!(cutter.scan(&seg[..cut]), Cut::More);
        assert_eq!(cutter.finish(cut), Cut::At(cut));
    }
}
