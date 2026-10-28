/* Mobile menu: the hamburger button shows/hides the nav links on small screens */
(function () {
    const nav = document.querySelector("nav");
    const toggle = document.querySelector(".menu-toggle");
    if (!nav || !toggle) return;

    function setOpen(open) {
        nav.classList.toggle("menu-open", open);
        toggle.setAttribute("aria-expanded", String(open));
        toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    }

    toggle.addEventListener("click", () => setOpen(!nav.classList.contains("menu-open")));

    // Close after tapping a link, tapping outside the nav, or pressing Escape
    nav.querySelectorAll("ul a").forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("click", (e) => { if (!nav.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

    // Reset if the screen is resized to desktop width
    window.matchMedia("(min-width: 901px)").addEventListener("change", (e) => { if (e.matches) setOpen(false); });
})();
