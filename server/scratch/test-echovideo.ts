import axios from 'axios';

async function test() {
  const dataId = 'B8NAysNoP33XZnwUVLTrEIYbsAk84KyTFfe1d_xE1PUYoKnqg9mz8H-mBOndQowO2CeWp-V_bair1-OCusta2kYNuBucwnRr_eRzATr150ABjmLo4aTmtCgaJgJFkm-0u9yI5o7RcsLCncJxDoaP0z0R4L7kAs2wSPUobEjrgZ6QEmeU0v_umEJDBFIER49X';
  const realId = '2444392065f0a61742473d342a2c160d';

  const urlsToTest = [
    `https://play.echovideo.ru/ajax/embed/get?id=${realId}`,
    `https://play.echovideo.ru/ajax/embed/get?id=${dataId}`,
    `https://play.echovideo.ru/ajax/embed/sources?id=${realId}`,
    `https://play.echovideo.ru/ajax/embed/sources?id=${dataId}`,
    `https://play.echovideo.ru/ajax/embed/getSources?id=${realId}`,
    `https://play.echovideo.ru/ajax/embed/getSources?id=${dataId}`,
  ];

  for (const url of urlsToTest) {
    try {
      const r = await axios.get(url, {
        headers: {
          'Referer': 'https://play.echovideo.ru/embed-1/B8NAysNoP33XZnwUVLTrEIYbsAk84KyTFfe1d_xE1PUYoKnqg9mz8H-mBOndQowO2CeWp-V_bair1-OCusta2kYNuBucwnRr_eRzATr150ABjmLo4aTmtCgaJgJFkm-0u9yI5o7RcsLCncJxDoaP0z0R4L7kAs2wSPUobEjrgZ6QEmeU0v_umEJDBFIER49X?v=1&asi=0&autoPlay=0&ao=0',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      console.log('SUCCESS:', url, JSON.stringify(r.data).substring(0, 200));
    } catch (e: any) {
      console.log('FAIL:', url, e.message);
    }
  }
}

test();
