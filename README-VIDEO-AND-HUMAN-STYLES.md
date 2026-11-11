# Teamball 14.1 — Human playstyle opponents and video review

## Learning from real player-vs-bot games
- A player must enable the existing gameplay-input training checkbox. The server then stores input + state samples from eligible human participants in `bot-memory/replays/*.json.gz`.
- The Python trainer classifies consenting player samples broadly as **pressing**, **technical** or **patient** from observed boost use, proximity to the ball and shooting activity. These are coarse training buckets, not claims about any player's identity or ability.
- Once a bucket has at least 64 samples, the trainer builds/updates a **portable neural opponent** under `bot-memory/models/human-styles/`. No identifying account data is included.
- When those models are available, alternating self-play matches challenge the candidate against a human-style opponent. The other matches continue to test established opponents. Benchmarks retain the prior champion/Expert baseline. Existing strong models are not overwritten by unbenchmarked candidates.
- These opponents express action choices through the existing AI blending, physical collisions, shot rules, stamina and other normal constraints.
- Every completed training cycle reevaluates the candidate; more data does **not** ensure a stronger model. Do not delete bot-memory when updating.

## Analyze original Teamball videos or saved YouTube gameplay
You can supply a **local MP4**, for example one you've recorded, one you have permission to use, or a video exported from YouTube using its available download tools. This build does **not** automatically download video URLs.

1. Optional dependency: double-click `INSTALL-VIDEO-ANALYSIS.cmd` after `INSTALL-AI-TRAINING.cmd`, or use `python -m pip install opencv-python-headless`.
2. Drag the `.mp4` file onto `ANALYZE-VIDEO.cmd` (or run `python train/analyze_video.py "file.mp4"`).
3. Review `bot-memory/video-profiles/<id>.analysis.json`: coverage, confidence and estimated team spacing / pressure / wall tendencies.
4. Only if the source/quality are acceptable, rerun with `--approve-for-training`, e.g. `python train/analyze_video.py "file.mp4" --approve-for-training`.
5. Approved profiles provide **weak tactical variations for training opponents**, never exact copied key presses and never an automatic update to a live champion.

**Important:** 2D videos do not expose hidden inputs, mouse directions, identities, or reliable world-speed measurements when the camera pans or zooms. The computer vision here is deliberately conservative. It does not directly train a neural player from raw video and cannot guarantee a clip's gameplay is faithfully reconstructed. Real in-game state/input recordings remain the stronger training source.

## Halftime
For actual-length games, halftime begins at half the regulation time. If the ball is already beyond the halfway line, the attack continues in the current half of the pitch until the ball returns across the center line or a goal is scored. The halftime break lasts three seconds, then teams switch goals and restart. Score and match reports persist. Practice and very short diagnostic/test matches have no halftime.
