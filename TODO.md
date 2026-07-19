- [ ] Update API config logic so `getApiFallbackUrl()` returns null in node/vitest (no window).
- [ ] Fix `.env.production` expectation for `VITE_API_URL` (blank line only) to satisfy unit tests.
- [ ] Re-run `npm test` until all unit + integration tests pass.
- [ ] After tests pass, run the streaming/infinite-load reproduction test and verify HLS proxy errors are resolved.

