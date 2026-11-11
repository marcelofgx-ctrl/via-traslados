/* Vía Traslados — presentación del formulario v1.
   No reemplaza los controladores de dirección, las reservas, OTP ni la sesión. */
(function () {
  "use strict";
  if (document.body.dataset.page !== "passenger") return;
  var byId = function (id) { return document.getElementById(id); };
  var form = byId("booking-form");
  var wizard = byId("solicitar");
  if (!form || !wizard) return;

  function refreshAddress(input, view) {
    var value = String(input.value || "").replace(/\s+/g, " ").trim();
    view.textContent = value || input.placeholder || "Elegí una dirección";
    view.setAttribute("title", value || "Elegí una dirección");
  }

  ["origin", "destination"].forEach(function (id) {
    var input = byId(id);
    if (!input) return;
    var field = input.closest(".route-field");
    var wrap = input.closest(".field-wrap");
    if (!field || !wrap || wrap.querySelector(".via-address-view")) return;
    var view = document.createElement("span");
    view.className = "via-address-view";
    view.setAttribute("role", "button");
    view.setAttribute("tabindex", "0");
    view.setAttribute("aria-label", id === "origin" ? "Editar dirección de origen" : "Editar dirección de destino");
    input.insertAdjacentElement("afterend", view);

    function edit() {
      field.classList.add("via-editing");
      input.focus();
      try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {}
    }
    function done() {
      refreshAddress(input, view);
      field.classList.remove("via-editing");
    }
    view.addEventListener("click", function (event) { event.preventDefault();edit(); });
    view.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault();edit(); }
    });
    input.addEventListener("input", function () { refreshAddress(input, view); });
    input.addEventListener("change", function () { refreshAddress(input, view); });
    input.addEventListener("via:address", function () { refreshAddress(input, view); });
    input.addEventListener("blur", function () {
      window.setTimeout(done, 140);
    });
    refreshAddress(input, view);
  });

  var first = form.querySelector('.wizard-step[data-step="1"]');
  var notes = first && first.querySelector(".notes-field");
  if (notes && !first.querySelector(".via-notes")) {
    var details = document.createElement("details");
    details.className = "via-notes";
    var summary = document.createElement("summary");
    var title = document.createElement("span");
    title.textContent = "¿Querés agregar una indicación?";
    var optional = document.createElement("span");
    optional.className = "via-notes-optional";
    optional.textContent = "Opcional";
    summary.appendChild(title);
    summary.appendChild(optional);
    notes.parentNode.insertBefore(details, notes);
    details.appendChild(summary);
    details.appendChild(notes);
    if (byId("notes") && byId("notes").value.trim()) details.open = true;
    byId("notes")?.addEventListener("input", function () {
      if (this.value.trim()) details.open = true;
    });
  }

  var eyebrow = first && first.querySelector(".section-eyebrow");
  if (eyebrow) eyebrow.textContent = "REVISIÓN DEL VIAJE";
  var heading = byId("booking-heading");
  if (heading) heading.textContent = "Confirmá tu recorrido";
  var description = first && first.querySelector(".wizard-description");
  if (description) description.textContent = "Verificá origen, destino y horario antes de continuar.";

  function sync() {
    ["origin", "destination"].forEach(function (id) {
      var input = byId(id);
      var view = input && input.closest(".field-wrap")?.querySelector(".via-address-view");
      if (view) refreshAddress(input, view);
    });
  }
  byId("start-booking")?.addEventListener("click", function () {
    window.requestAnimationFrame(function () {
      sync();
      window.scrollTo(0, 0);
    });
  });
  byId("wizard-back")?.addEventListener("click", function () {
    window.requestAnimationFrame(sync);
  });
  window.addEventListener("pageshow", sync);
})();
