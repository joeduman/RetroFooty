# Multiplayer chat

Restart the server and refresh browsers to load the chat update.

- **Enter** opens the message input and shows animated typing dots above your
  character. Enter again sends; **Escape** cancels. Touch users can tap
  **Chat · Enter** to open the input, then tap Send.
- Messages appear in small speech bubbles above players for six seconds. Long
  bubbles wrap to three lines; the chat log keeps the full message.
- The translucent bottom-left panel shows the most recent 80 messages.
  **Hide chat** collapses the panel to a small Show chat control. That choice is
  saved on the browser. Enter can still open the input while the log is hidden;
  hiding the log does not hide avatar bubbles.
- Movement, shooting and sprint input are cleared when entering chat. Typing
  letters or pressing Escape does not activate gameplay controls.
- Park chat is shared by everyone connected to the park, including people on
  different courts. Private rooms have their own isolated chat channel.

Messages and typing status use the existing WebSocket connection. Sender names
and IDs come from the server session. Messages are plain text, limited to 160
characters and three sends per five seconds. Typing status is renewed while
the input is open, expires after six seconds without a heartbeat, and is
cleared on sending, cancellation, focus loss and disconnect. Bots never inherit
a departed human's messages or typing indicator.

Chat history is transient server memory, not saved to account files, bot
training data or disk. New arrivals receive the current channel's recent log,
without replaying old speech bubbles. A server restart clears chat history.

## Files and checks

`chat.mjs` handles channels, identities and throttling;
`public/js/chat-config.mjs` centralizes limits and timing;
`public/js/chat-client.mjs` manages input, history, hide preference and visual
state; `public/js/chat-bubbles.mjs` draws compact Canvas bubbles and typing dots;
`public/chat.css` styles the panel. The existing park / private-room servers,
clients, HTML and renderers connect these pieces. Server test fixtures include
the new module in their isolated copies.

Run `node --test tests/chat.test.mjs` for sanitization, limits, history, typing
expiry, identity, bot substitution and real WebSocket channel-isolation tests.
Run `node tests/chat-browser.mjs` for an isolated headless Chrome check of chat
controls, suppressed movement, literal text rendering, typing indicators,
hidden-panel composition, on-field chat and mobile layout. Set
`TEAMBALL_BROWSER` to a Chrome executable path if needed.

Desktop and mobile screenshots are saved as `tests/screenshots/chat-*.png`.
`tests/chat-full-results.txt` records the full run: **313/314 passing**, with
the pre-existing Build 12 pitch-shrink assertion still failing against the
later enlarged pitch dimensions.
