# AGENTS.md

## Purpose
This repository is a browser-based Olympic curling POC built with:
- `index.html` (UI layout and HUD)
- `styles.css` (visual styling)
- `game.js` (all gameplay, rendering overlays, audio, and state)
- `tests/gameplay-mechanics.test.js` (mechanics tests)

Primary goal: preserve smooth, responsive gameplay while iterating quickly on visuals and controls.

## Working Priorities
1. Keep frame rate smooth and input responsive.
2. Preserve existing gameplay rules unless explicitly changed by the user.
3. Make small, targeted edits; avoid broad rewrites.
4. Keep visuals consistent with the current art direction/assets.

## Current Gameplay Rules (Source of Truth)
- Teams: `GB` (red stones) vs `USA` (yellow stones).
- Match format: `3` ends, `6` stones per team per end.
- Turn order alternates between teams.
- Aiming:
  - Mouse/trackpad horizontal position (clamped by pre-release limits).
  - Arrow keys (`←`/`→`) also adjust aim.
- Throw:
  - Hold `Space` to charge power meter.
  - Release `Space` to deliver.
- Sweeping:
  - Sweeping is triggered by rapid `Space` taps after release.
  - Sweeping effect is subtle and time-limited.
  - Sweeping is blocked when another stone is within the configured proximity threshold.
- Stone removal:
  - Stones are removed only when the entire stone has crossed below the lowest green line.
- End scoring:
  - Only stones touching/breaking the outer blue ring are eligible.
  - One team scores: number of its stones closer than opponent’s nearest eligible stone.
- End transition:
  - Scoring stones flash for 3 cycles before continue input is accepted.

## Visual/UX Constraints
- Keep the title screen image-based (`images/title-screen.png`), full-screen.
- Keep scoreboard and controls in the left HUD area.
- Keep playfield and camera behavior stable unless user asks for change.
- Prefer subtle effects over heavy effects that may hurt performance.

## Performance Guidelines
- Avoid per-frame expensive allocations.
- Reuse cached patterns/sprites/audio nodes where possible.
- Do not add large dynamic DOM updates in the main loop.
- Any new visual/audio effect should be tested for stutter before finalizing.

## Editing Guidelines
- Make minimal diffs.
- Do not remove or rename existing assets unless requested.
- Keep constants centralized in `game.js` near related config values.
- When changing mechanics, update matching test expectations in `tests/gameplay-mechanics.test.js`.

## Validation Checklist
After gameplay or physics edits:
1. Run syntax check:
   - `node --check game.js`
2. Run tests:
   - `node tests/gameplay-mechanics.test.js`
3. Manually verify in browser:
   - launch/release flow
   - sweep behavior
   - scoring at end of end
   - transition/winner flows

## Notes For Future Agents
- User prefers iterative tuning via small numeric adjustments.
- Preserve established controls copy in HUD unless asked:
  - `←/→ Aim`
  - `Space Hold power & release`
  - `Space Tap to Sweep!`
