# Design QA — X Bookmarks Candidate Card

- Source visual truth:
  - Default: `/var/folders/y4/bm7_pwm90gvcmhdlvcky_d0m0000gn/T/codex-clipboard-a5ba1fbc-424b-4681-9b36-261173627326.png`
  - Add-to-inbox hover reference: `/var/folders/y4/bm7_pwm90gvcmhdlvcky_d0m0000gn/T/codex-clipboard-9ccb92e9-86cb-4680-885e-d71f79a6d28d.png`
  - Remove-from-inbox hover reference: `/var/folders/y4/bm7_pwm90gvcmhdlvcky_d0m0000gn/T/codex-clipboard-be01cd49-548e-4cc1-8666-bc12dbbfc8a1.png`
- Implementation screenshot: unavailable
- Source pixels: 2880 × 1800 for each primary reference
- Implementation pixels: unavailable
- Target CSS size and density: 600 CSS px X center column at @2x; implementation must be captured at the same density or normalized to the same pixel dimensions
- States: default active inbox Card; destructive remove hover/focus; Card removed and following Card reflowed upward

**Findings**

- [Blocked] No browser-rendered Side Panel screenshot is available for the required same-viewport comparison.
  Location: real Chrome extension Side Panel.
  Evidence: Chrome connected and exposed the already-open `https://x.com/i/bookmarks` tab, but the first viewport screenshot attempt timed out and reset the execution session. Repository rules prohibit repeating the same large-page capture strategy after a timeout.
  Impact: fonts, exact geometry, remote image crop, icon paths, hover rendering, text truncation and Card reflow cannot be certified visually from source code or static tests.
  Fix: refresh the unpacked extension, reopen the Side Panel, and provide or capture @2x screenshots at a 600 CSS px content width for all three required states.

**Static evidence**

- Candidate layout uses a 40px avatar, 12px column gap, 12px/16px Card padding, 12px Article radius, approximately 2.55:1 media, 15px/20px title and excerpt, and 18.75px icons.
- Candidate `•••`, `candidate-ignore`, and `candidate-save` are absent; the 34px overflow slot remains reserved.
- The engagement row renders reply, repost, like, views, extension bookmark, native X bookmark and share positions. Only the extension bookmark is a button; snapshot controls are hidden from assistive technology.
- Both removal paths write the existing record to the internal `ignored` tombstone. Re-adding reuses the record, restores `new`, refreshes the captured preview fields and keeps assets unchanged.
- Legacy records omit unavailable media, excerpt, metrics and icon data rather than inventing placeholders.

**Required fidelity surfaces**

- Fonts and typography: statically set to TwitterChirp plus X-compatible system fallbacks, 15px/20px author/title/excerpt text and X weights; browser antialiasing, wrapping and truncation are unverified.
- Spacing and layout rhythm: the 600px Card geometry and narrow fluid rules are encoded; exact pixel alignment and no-overflow behavior at 600px, common narrow width and minimum usable width are unverified.
- Colors and visual tokens: primary, secondary, border, brand blue and destructive red reuse existing X tokens; rendered hover/focus color and contrast are unverified.
- Image quality and asset fidelity: new candidates retain visible X avatar and cover URLs with `object-fit: cover`; crop, sharpness and remote loading are unverified.
- Copy and content: visible removal wording is consistently “从收件箱移除”; no candidate UI exposes “忽略”. Snapshot counts are captured as visible strings and are never fabricated.

**Full-view comparison evidence**

- Not available because the implementation screenshot could not be captured. No visual match claim is made.

**Focused region comparison evidence**

- Not available. Author row, Article media/body and engagement row require separate focused crops after the full-view capture succeeds.

**Comparison history**

- Iteration 1: source references were available; implementation capture timed out before an equal-size combined comparison could be produced. No visual P0/P1/P2 judgment was possible.

**Implementation checklist**

- Refresh the unpacked extension from `/Users/kanglei/Desktop/x-to-md` and reopen the Side Panel.
- Set the Side Panel content region to 600 CSS px and capture at @2x using the same candidate content as the X reference.
- Capture default, remove hover/focus and post-removal reflow states.
- Capture common narrow and minimum usable widths and confirm no horizontal scroll or obscured controls.
- Place each source and implementation capture into the same comparison image; fix every P0/P1/P2 difference and repeat.
- Change `final result` to `passed` only after the final visual comparison has no actionable P0/P1/P2 findings.

final result: blocked
