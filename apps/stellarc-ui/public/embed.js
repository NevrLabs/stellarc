/**
 * KFL-177 embed script: fetch the public ticket fields and paint them with
 * textContent only. No innerHTML anywhere — the title is user content and this
 * page runs unauthenticated on third-party sites.
 */
(() => {
  function escapeHtml(value) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(String(value)));
    return div.innerHTML;
  }

  // Canonical form: /embed.html?id=<ticketId>. Pure static — every host
  // (vite preview, nginx, CDN) serves it without extra routing rules.
  var params = new URLSearchParams(window.location.search);
  var ticketId = params.get("id");
  if (!ticketId) return;

  fetch("/api/public-ticket-embed/" + encodeURIComponent(ticketId), {
    headers: { Accept: "application/json" },
  })
    .then((res) => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then((ticket) => {
      document.getElementById("ticketKey").textContent = ticket.ticketKey || "";
      document.getElementById("organizationName").textContent =
        ticket.organizationName || "";
      document.getElementById("title").textContent = ticket.title || "";
      document.getElementById("card").hidden = false;
    })
    .catch(() => {
      // 404 (private board or missing ticket): stay hidden, show nothing.
      document.getElementById("title").textContent = "Ticket unavailable";
      document.getElementById("card").hidden = false;
    });
})();
