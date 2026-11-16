/* VM Lab · Cuttlefish — every running phone mirrored side by side. Plain script, uses window.VL. */
(function () {
  "use strict";
  const { api, h, toast } = window.VL;
  const $ = s => document.querySelector(s);

  async function build() {
    const wall = $("#wall"); wall.innerHTML = "";
    let st;
    try { st = await api("GET", "/api/cuttlefish/status"); }
    catch (e) { toast(e.message, "bad"); return; }
    const ready = (st.groups || []).flatMap(g => g.instances).filter(i => i.adb === "device");
    $("#w-count").textContent = ready.length + " running";
    if (!ready.length) { wall.appendChild(h("div", { class: "none" }, "No phone is running. ", h("a", { href: "/vmlab/cuttlefish" }, "Start them from Cuttlefish"), ".")); return; }
    // Phones are tall: one row of up to 4, then wrap.
    const cols = Math.min(ready.length, 4);
    wall.style.gridTemplateColumns = "repeat(" + cols + ", minmax(0,1fr))";
    wall.style.gridTemplateRows = "repeat(" + Math.ceil(ready.length / cols) + ", minmax(0,1fr))";
    ready.forEach(i => wall.appendChild(h("iframe", { src: "/mobile/view/" + encodeURIComponent(i.serial),
      title: "Phone " + i.name, allow: "autoplay; clipboard-read; clipboard-write; fullscreen" })));
  }
  $("#w-reload").addEventListener("click", build);
  build();
})();
