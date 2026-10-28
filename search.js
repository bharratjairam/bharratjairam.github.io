/*
 * Site search
 * Indexes experience, education, skills, and projects across index.html and
 * projects.html, then shows results in a pop-up search box.
 * Open with the Search button, Ctrl+K / Cmd+K, or "/".
 */
(function () {
    const PAGES = ["index.html", "projects.html"];
    const SUGGESTIONS = ["Python", "SQL Server", "Unity", "Help Desk", "Active Directory", "Game"];

    const currentPage = (() => {
        const file = location.pathname.split("/").pop();
        return PAGES.includes(file) ? file : "index.html";
    })();

    let entries = [];
    let results = [];
    let activeIndex = 0;

    /* ---------- Indexing ---------- */

    function slug(text) {
        return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    }

    function clean(text) {
        return (text || "").replace(/\s+/g, " ").trim();
    }

    // Gives every searchable block a stable id. Runs the same way on the live page
    // and on fetched copies, so result links always point at the right element.
    function collect(doc, page) {
        const found = [];
        const blocks = doc.querySelectorAll(".timeline-item, .project-card, .skill-box");
        const counts = {};

        blocks.forEach((el) => {
            const section = el.closest("section");
            const sectionId = section ? section.id : "top";
            const heading = section ? section.querySelector("h2") : null;
            const titleEl = el.querySelector(".item-title, .project-title, h3");
            const subtitleEl = el.querySelector(".item-subtitle");
            const dateEl = el.querySelector(".item-date");

            const title = clean(titleEl && titleEl.textContent);
            const subtitle = clean(subtitleEl && subtitleEl.textContent);
            const base = sectionId + "-" + slug(title + " " + subtitle);
            counts[base] = (counts[base] || 0) + 1;
            const id = el.id || (counts[base] > 1 ? base + "-" + counts[base] : base);
            el.id = id;

            found.push({
                page,
                id,
                title,
                subtitle,
                date: clean(dateEl && dateEl.textContent),
                section: clean(heading && heading.textContent),
                // Body text without the title/subtitle/date, which are shown separately
                text: clean([title, subtitle, clean(dateEl && dateEl.textContent)].reduce(
                    (t, part) => (part ? t.replace(part, " ") : t), clean(el.textContent))),
            });
        });
        return found;
    }

    async function buildIndex() {
        entries = collect(document, currentPage);
        const others = PAGES.filter((p) => p !== currentPage);
        await Promise.all(others.map(async (page) => {
            try {
                const res = await fetch(page);
                if (!res.ok) return;
                const doc = new DOMParser().parseFromString(await res.text(), "text/html");
                entries = entries.concat(collect(doc, page));
            } catch (e) {
                // Opened from disk (file://) - only the current page can be searched.
            }
        }));
    }

    /* ---------- Searching ---------- */

    function escapeHtml(text) {
        return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function escapeRegex(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    function highlight(text, terms) {
        let html = escapeHtml(text);
        terms.forEach((t) => {
            html = html.replace(new RegExp("(^|[^a-z0-9;])(" + escapeRegex(escapeHtml(t)) + ")", "gi"), "$1<mark>$2</mark>");
        });
        return html;
    }

    function snippet(text, terms) {
        let pos = -1;
        for (const t of terms) {
            const m = termRegex(t).exec(text);
            if (m) { pos = m.index + m[1].length; break; }
        }
        if (pos === -1) return text.slice(0, 140) + (text.length > 140 ? "…" : "");
        const start = Math.max(0, pos - 50);
        const end = Math.min(text.length, pos + 110);
        return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
    }

    // Terms match at the start of a word, so "unity" finds Unity but not "community"
    function termRegex(t, flags) {
        return new RegExp("(^|[^a-z0-9])" + escapeRegex(t), flags || "i");
    }

    function search(query) {
        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.length) return [];
        const scored = [];
        entries.forEach((entry) => {
            const head = entry.title + " " + entry.subtitle;
            const regs = terms.map((t) => termRegex(t));
            if (!regs.every((r) => r.test(entry.text) || r.test(head))) return;
            let score = 0;
            terms.forEach((t, i) => {
                if (entry.title.toLowerCase().startsWith(t)) score += 6;
                if (regs[i].test(head)) score += 4;
                score += Math.min((entry.text.match(termRegex(t, "gi")) || []).length, 5);
            });
            if (entry.page === currentPage) score += 0.5;
            scored.push({ entry, score, terms });
        });
        return scored.sort((a, b) => b.score - a.score).slice(0, 20);
    }

    /* ---------- UI ---------- */

    const overlay = document.createElement("div");
    overlay.className = "search-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Search the site");
    overlay.innerHTML = `
        <div class="search-panel">
            <div class="search-input-row">
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                <input type="search" class="search-input" placeholder="Search experience, skills, projects…" autocomplete="off" spellcheck="false" aria-label="Search">
                <button type="button" class="search-close" aria-label="Close search">Esc</button>
            </div>
            <div class="search-results" role="listbox"></div>
            <div class="search-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
        </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector(".search-input");
    const list = overlay.querySelector(".search-results");

    function renderEmpty() {
        list.innerHTML = `
            <div class="search-hint">Try searching for</div>
            <div class="search-chips">${SUGGESTIONS.map((s) => `<button type="button" class="search-chip">${escapeHtml(s)}</button>`).join("")}</div>`;
        list.querySelectorAll(".search-chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                input.value = chip.textContent;
                update();
                input.focus();
            });
        });
    }

    function render() {
        if (!input.value.trim()) return renderEmpty();
        if (!results.length) {
            list.innerHTML = `<div class="search-hint">No results for “${escapeHtml(input.value.trim())}”</div>`;
            return;
        }
        list.innerHTML = results.map((r, i) => {
            const e = r.entry;
            const meta = [e.section, e.page === currentPage ? "" : (e.page === "projects.html" ? "Projects page" : "Home page")]
                .filter(Boolean).join(" · ");
            return `
                <a class="search-result${i === activeIndex ? " active" : ""}" role="option" href="${e.page}#${e.id}" data-index="${i}">
                    <div class="search-result-meta">${escapeHtml(meta)}</div>
                    <div class="search-result-title">${highlight(e.title, r.terms)}${e.subtitle ? `<span class="search-result-sub"> — ${highlight(e.subtitle, r.terms)}</span>` : ""}</div>
                    <div class="search-result-snippet">${highlight(snippet(e.text, r.terms), r.terms)}</div>
                </a>`;
        }).join("");

        list.querySelectorAll(".search-result").forEach((a) => {
            a.addEventListener("click", (ev) => {
                ev.preventDefault();
                go(results[Number(a.dataset.index)].entry);
            });
            a.addEventListener("mousemove", () => setActive(Number(a.dataset.index)));
        });
    }

    function setActive(i) {
        if (i === activeIndex) return;
        activeIndex = i;
        list.querySelectorAll(".search-result").forEach((a, j) => a.classList.toggle("active", j === i));
        const el = list.querySelector(".search-result.active");
        if (el) el.scrollIntoView({ block: "nearest" });
    }

    function update() {
        results = search(input.value);
        activeIndex = 0;
        render();
    }

    function flash(el) {
        el.classList.remove("search-flash");
        void el.offsetWidth; // restart the animation
        el.classList.add("search-flash");
        setTimeout(() => el.classList.remove("search-flash"), 2200);
    }

    function go(entry) {
        close();
        if (entry.page === currentPage) {
            const el = document.getElementById(entry.id);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                history.replaceState(null, "", "#" + entry.id);
                flash(el);
            }
        } else {
            location.href = entry.page + "#" + entry.id;
        }
    }

    let lastFocus = null;

    function open() {
        lastFocus = document.activeElement;
        overlay.classList.add("open");
        document.body.classList.add("search-open");
        input.select();
        update();
        setTimeout(() => input.focus(), 10);
    }

    function close() {
        overlay.classList.remove("open");
        document.body.classList.remove("search-open");
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    /* ---------- Events ---------- */

    document.querySelectorAll(".search-trigger").forEach((btn) => btn.addEventListener("click", open));
    overlay.querySelector(".search-close").addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    input.addEventListener("input", update);

    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); if (results.length) setActive((activeIndex + 1) % results.length); }
        else if (e.key === "ArrowUp") { e.preventDefault(); if (results.length) setActive((activeIndex - 1 + results.length) % results.length); }
        else if (e.key === "Enter") { e.preventDefault(); if (results[activeIndex]) go(results[activeIndex].entry); }
    });

    document.addEventListener("keydown", (e) => {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            overlay.classList.contains("open") ? close() : open();
        } else if (e.key === "/" && !typing && !overlay.classList.contains("open")) {
            e.preventDefault();
            open();
        } else if (e.key === "Escape" && overlay.classList.contains("open")) {
            close();
        }
    });

    // Show the right shortcut on Macs
    if (/Mac|iPhone|iPad/.test(navigator.platform)) {
        document.querySelectorAll(".search-trigger kbd").forEach((k) => (k.textContent = "⌘ K"));
    }

    /* ---------- Start ---------- */

    buildIndex().then(() => {
        // Arriving from a search result on the other page: scroll to and highlight it
        const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
        if (target && target.matches(".timeline-item, .project-card, .skill-box")) {
            setTimeout(() => {
                target.scrollIntoView({ behavior: "smooth", block: "center" });
                flash(target);
            }, 150);
        }
        if (overlay.classList.contains("open")) update();
    });
})();
