const $ = id => document.getElementById(id);

let allProducts = [];
let selectedFile = null;

const money = value =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(value);

function discount(product) {
  return product.mrp
    ? Math.round((1 - product.sellingPrice / product.mrp) * 100)
    : 0;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function productCard(product) {
  return `
    <article class="product-card">
      <div class="product-icon">
        ${product.brand === "Philips" ? "💡" : "▦"}
      </div>

      <div class="product-info">
        <strong>
          ${escapeHtml(product.brand)} ${escapeHtml(product.product)}
        </strong>
        <small>${escapeHtml(product.variant)}</small>
      </div>

      <div class="price">
        <strong>${money(product.sellingPrice)}</strong>
        <del>${money(product.mrp)}</del>
        <div class="discount">${discount(product)}% OFF</div>
      </div>
    </article>
  `;
}

function renderCatalogue(products) {
  $("count").textContent = `${products.length} ITEMS`;

  $("catalogue").innerHTML = products.length
    ? products.map(productCard).join("")
    : `<div class="empty">No matching products found.</div>`;
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    const data = await response.json();

    allProducts = data.products || [];
    renderCatalogue(allProducts);
  } catch {
    $("catalogue").innerHTML =
      `<div class="empty">Could not load catalogue. Refresh the page.</div>`;
  }
}

// Search products
$("search").addEventListener("input", event => {
  const query = event.target.value.toLowerCase().trim();

  const filtered = allProducts.filter(product =>
    [
      product.brand,
      product.product,
      product.variant,
      product.id
    ].join(" ").toLowerCase().includes(query)
  );

  renderCatalogue(filtered);
});

// Photo selection
$("photo").addEventListener("change", event => {
  selectedFile = event.target.files[0] || null;

  $("scan-button").disabled = !selectedFile;
  $("preview-wrap").hidden = !selectedFile;

  if (selectedFile) {
    $("preview").src = URL.createObjectURL(selectedFile);
    $("scan-status").textContent = selectedFile.name;
  }
});

// Remove photo
$("clear-photo").addEventListener("click", () => {
  $("photo").value = "";
  selectedFile = null;

  $("preview-wrap").hidden = true;
  $("scan-button").disabled = true;
  $("scan-status").textContent = "Add an image to begin.";
});

// Identify product
$("scan-button").addEventListener("click", async () => {
  if (!selectedFile) return;

  const button = $("scan-button");

  button.disabled = true;
  button.textContent = "Identifying product...";
  $("scan-status").textContent = "Checking the product against your catalogue.";

  $("result-section").hidden = true;

  try {
    const form = new FormData();
    form.append("image", selectedFile);

    const response = await fetch("/api/identify", {
      method: "POST",
      body: form
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Identification failed.");
    }

    renderMatch(data);

    $("result-section").hidden = false;
    $("scan-status").textContent =
      "Scan complete. Confirm the correct variant before quoting.";

    $("result-section").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  } catch (error) {
    $("scan-status").textContent = error.message;
  } finally {
    button.disabled = !selectedFile;
    button.innerHTML = 'Identify product <span>→</span>';
  }
});

function renderMatch(data) {
  const matched = data.matched;

  if (!matched) {
    $("result-content").innerHTML =
      `<div class="empty">${escapeHtml(data.message)}</div>`;
    return;
  }

  const variants = data.variants || [];

  $("result-content").innerHTML = `
    <div class="match-card">
      <h3>${escapeHtml(matched.brand)} ${escapeHtml(matched.product)}</h3>

      <div class="sub">
        ${escapeHtml(matched.variant)} · ${escapeHtml(matched.id)}
      </div>

      <div class="big-price" id="match-price">
        ${money(matched.sellingPrice)}
      </div>

      <div class="old-price">
        MRP <del id="match-mrp">${money(matched.mrp)}</del>
        · <b id="match-discount">${discount(matched)}% OFF</b>
      </div>

      <div class="save" id="match-save">
        You save ${money(matched.mrp - matched.sellingPrice)}
      </div>

      <div class="variant-title">SELECT PRODUCT VARIANT</div>

      <div class="variants">
        ${variants.map(product => `
          <button
            class="variant ${product.id === matched.id ? "active" : ""}"
            data-id="${escapeHtml(product.id)}"
          >
            ${escapeHtml(product.variant)}
          </button>
        `).join("")}
      </div>

      <div class="notice">
        ${escapeHtml(data.message)}
        AI identification can be imperfect. Verify the product and
        variant before quoting the price.
      </div>
    </div>
  `;

  $("result-content").querySelectorAll(".variant").forEach(button => {
    button.addEventListener("click", () => {
      const product = variants.find(
        item => item.id === button.dataset.id
      );

      if (!product) return;

      $("result-content").querySelectorAll(".variant").forEach(item => {
        item.classList.toggle("active", item === button);
      });

      $("match-price").textContent = money(product.sellingPrice);
      $("match-mrp").textContent = money(product.mrp);
      $("match-discount").textContent = `${discount(product)}% OFF`;
      $("match-save").textContent =
        `You save ${money(product.mrp - product.sellingPrice)}`;

      $("result-content").querySelector("h3").textContent =
        `${product.brand} ${product.product}`;

      $("result-content").querySelector(".sub").textContent =
        `${product.variant} · ${product.id}`;
    });
  });
}

loadProducts();
