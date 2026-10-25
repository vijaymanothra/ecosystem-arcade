// ============================================================
//  ARCADE SETTINGS — the one file to edit when you deploy.
// ============================================================
window.ARCADE_CONFIG = {
  // Where the shared scores API lives.
  //   'auto' — use <this site>/api when the games are opened from a web server
  //            (for example the included Node server, `npm start`), and keep scores
  //            on this device when the games are opened as local files.
  //   ''     — never share: every device keeps its own leaderboards.
  //   'https://scores.example.com/api' — a scores API hosted somewhere else
  //            (use this on kiosks that open the games from local files).
  scoresApi: 'auto',

  // How often each screen pulls the latest shared scores, in seconds.
  syncSeconds: 20,
};
