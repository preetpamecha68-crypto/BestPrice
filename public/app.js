const $ = id => document.getElementById(id);

let allProducts = [];
let selectedFile = null;
let activeProductPage = false;
let currentObjectURL = null;

const money = value =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);

function discount(product) {
  return Number(product.mrp) > 0
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

// Product page styling
function installProductStyles() {
  if (document.getElementById("bestprice-product-styles")) return;

  const style = document.createElement("style");
  style.id = "bestprice-product-styles";

  style.textContent = `
    .bp-product-page {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: #f2f5f0;
      color: #18251f;
      overflow-y: auto;
      padding: 0 18px 35px;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      animation: bp-appear .22s ease;
    }

    @keyframes bp-appear {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .bp-product-inner {
      max-width: 700px;
      margin: auto;
    }

    .bp-product-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 0;
      border-bottom: 1px solid #dfe8df;
    }

    .bp-back {
      border: 1px solid #dce5dc;
      background: white;
      border-radius: 12px;
      padding: 11px 15px;
      color: #194b3b;
      font-weight: 750;
      cursor: pointer;
    }

    .bp-product-brand {
      font-size: 11px;
      font-weight: 850;
      letter-spacing: 2px;
      color: #668075;
    }

    .bp-product-hero {
      margin-top: 25px;
      background: #102d25;
      color: white;
      border-radius: 23px;
      padding: 25px;
      overflow: hidden;
    }

    .bp-product-label {
      color: #d7f36b;
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 2px;
      text-transform: uppercase;
    }

    .bp-product-hero h1 {
      font-size: clamp(27px, 6vw, 39px);
      line-height: 1.15;
      letter-spacing: -1px;
      margin: 15px 0 8px;
    }

    .bp-product-subtitle {
      color: #b9cec5;
      font-size: 13px;
    }

    .bp-product-photo {
      margin-top: 20px;
      width: 100%;
      max-height: 220px;
      object-fit: contain;
      border-radius: 15px;
      background: #ffffff;
    }

    .bp-price-panel {
      background: white;
      border: 1px solid #e2e9e2;
      border-radius: 19px;
      padding: 23px;
      margin-top: 16px;
      box-shadow: 0 8px 28px rgba(16,45,37,.05);
    }

    .bp-price-label {
      color: #77847c;
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 1.5px;
      text-transform: uppercase;
    }

    .bp-selling-price {
      font-size: 43px;
      font-weight: 900;
      letter-spacing: -2px;
      color: #194b3b;
      margin: 9px 0;
    }

    .bp-price-details {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      font-size: 12px;
      color: #77847c;
    }

    .bp-discount {
      color: #24704d;
      background: #e6f0df;
      padding: 7px 11px;
      border-radius: 20px;
      font-weight: 850;
    }

    .bp-savings {
      margin-top: 15px;
      padding-top: 14px;
      border-top: 1px solid #e8eee8;
      color: #24704d;
      font-size: 13px;
      font-weight: 750;
    }

    .bp-variant-panel {
      margin-top: 17px;
      background: white;
      border: 1px solid #e2e9e2;
      border-radius: 19px;
      padding: 22px;
    }

    .bp-variant-panel h3 {
      font-size: 14px;
      margin: 0 0 15px;
    }

    .bp-variant-list {
      display: flex;
      flex-wrap: wrap;
      gap: 9px;
    }

    .bp-variant-button {
      border: 1px solid #dce5dc;
      border-radius: 11px;
      background: white;
      padding: 11px 14px;
      color: #263b30;
      font-size: 12px;
      font-weight: 750;
      cursor: pointer;
    }

    .bp-variant-button.active {
      background: #102d25;
      color: #d7f36b;
      border-color: #102d25;
    }

    .bp-product-notice {
      margin-top: 16px;
      padding: 14px;
      border-radius: 12px;
      background: #fff8e8;
      color: #785c20;
      font-size: 11px;
      line-height: 1.6;
    }

    .bp-no-match {
      margin-top: 16px;
      padding: 18px;
      background: white;
      border: 1px dashed #cbd8cb;
      border-radius: 15px;
      color: #77847c;
      font-size: 13px;
      line-height: 1.6;
    }

    .bp-product-footer {
      text-align: center;
      color: #89958c;
      font-size: 10px;
      padding: 30px 0 10px;
      letter-spacing: 1px;
    }
  `;

  document.head.appendChild(style);
}

// Product catalogue card
function productCard(product) {
  return `
    <article class="product-card"
      data-product-id="${escapeHtml(product.id)}"
      style="cursor:pointer"
      role="button"
      tabindex="0"
      aria-label="View ${escapeHtml(product.brand)} ${escapeHtml(product.product)}">

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

    if (!response.ok) throw new Error("Catalogue unavailable.");

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

// Open product from catalogue
$("catalogue").addEventListener("click", event => {
  const card = event.target.closest("[data-product-id]");
  if (!card) return;

  const product = allProducts.find(
    item => String(item.id) === card.dataset.productId
  );

  if (product) {
    openProductPage(product, [product], null);
  }
});

$("catalogue").addEventListener("keydown", event => {
  if (event.key !== "Enter" && event.key !== " ") return;

  const card = event.target.closest("[data-product-id]");
  if (!card) return;

  event.preventDefault();

  const product = allProducts.find(
    item => String(item.id) === card.dataset.productId
  );

  if (product) {
    openProductPage(product, [product], null);
  }
});

// Photo selection
$("photo").addEventListener("change", event => {
  selectedFile = event.target.files[0] || null;

  $("scan-button").disabled = !selectedFile;
  $("preview-wrap").hidden = !selectedFile;

  if (currentObjectURL) {
    URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = null;
  }

  if (selectedFile) {
    currentObjectURL = URL.createObjectURL(selectedFile);
    $("preview").src = currentObjectURL;
    $("scan-status").textContent = selectedFile.name;
  }
});

// Remove photo
$("clear-photo").addEventListener("click", () => {
  $("photo").value = "";
  selectedFile = null;

  if (currentObjectURL) {
    URL.revokeObjectURL(currentObjectURL);
    currentObjectURL = null;
  }

  $("preview").removeAttribute("src");
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
  $("scan-status").textContent =
    "Checking the product against your catalogue.";

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

    const variants = data.variants || [];
    const matched = data.matched || data.match || data.product;

    if (matched || variants.length || data.identified) {
      openProductPage(
        matched || variants[0] || null,
        variants,
        data
      );

      $("scan-status").textContent =
        "Scan complete. Verify the product and variant before quoting.";
    } else {
      $("scan-status").textContent =
        data.message || "No catalogue match found.";
    }

  } catch (error) {
    $("scan-status").textContent = error.message;
  } finally {
    button.disabled = !selectedFile;
    button.innerHTML = 'Identify product <span>→</span>';
  }
});

// Open dedicated product details page
function openProductPage(product, variants = [], scanData = null) {
  installProductStyles();

  if (activeProductPage) {
    document.querySelector(".bp-product-page")?.remove();
  } else {
    activeProductPage = true;
    history.pushState(
      { bestPriceProductPage: true },
      "",
      "#product"
    );
  }

  const identified = scanData?.identified || {};

  const brand = product?.brand || identified.brand || "Unknown brand";
  const name = product?.product || identified.product || "Identified product";
  const image = currentObjectURL || "";

  const page = document.createElement("section");
  page.className = "bp-product-page";
  page.setAttribute("aria-label", "Product details");

  page.innerHTML = `
    <div class="bp-product-inner">

      <header class="bp-product-top">
        <button class="bp-back" id="bp-back">← Back</button>
        <div class="bp-product-brand">BESTPRICE</div>
      </header>

      <section class="bp-product-hero">
        <div class="bp-product-label">Product details</div>
        <h1 id="bp-product-name">${escapeHtml(brand)} ${escapeHtml(name)}</h1>
        <div class="bp-product-subtitle" id="bp-product-variant">
          ${escapeHtml(product?.variant || identified.variant || "Select a variant")}
        </div>
        ${image ? `
          <img
            class="bp-product-photo"
            src="${image}"
            alt="Scanned product"
          >
        ` : ""}
      </section>

      <section id="bp-price-area"></section>

      <section class="bp-variant-panel">
        <h3>AVAILABLE PRODUCT VARIANTS</h3>
        <div class="bp-variant-list" id="bp-variant-list"></div>
      </section>

      <div class="bp-product-notice">
        ${escapeHtml(scanData?.message ||
          "Catalogue price shown. Verify the product and variant before quoting.")}
        <br><br>
        AI identification may not always be exact. Always confirm the physical
        product before sharing a price.
      </div>

      <footer class="bp-product-footer">
        BESTPRICE · STAFF PRICE FINDER
      </footer>
    </div>
  `;

  document.body.appendChild(page);

  function showProduct(selected) {
    if (!selected) {
      $("bp-price-area").innerHTML = `
        <div class="bp-no-match">
          No exact catalogue match is available yet.
          Select an available variant if one is listed, or search the catalogue.
        </div>
      `;
      return;
    }

    $("bp-product-name").textContent =
      `${selected.brand} ${selected.product}`;

    $("bp-product-variant").textContent = selected.variant;

    $("bp-price-area").innerHTML = `
      <section class="bp-price-panel">
        <div class="bp-price-label">Staff selling price</div>

        <div class="bp-selling-price">
          ${money(selected.sellingPrice)}
        </div>

        <div class="bp-price-details">
          <span>MRP <del>${money(selected.mrp)}</del></span>
          <span class="bp-discount">${discount(selected)}% OFF</span>
        </div>

        <div class="bp-savings">
          You save ${money(
            Number(selected.mrp) - Number(selected.sellingPrice)
          )}
        </div>
      </section>
    `;

    page.querySelectorAll(".bp-variant-button").forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.id === String(selected.id)
      );
    });
  }

  const uniqueVariants = variants.filter((item, index, array) =>
    array.findIndex(other =>
      String(other.id) === String(item.id)
    ) === index
  );

  if (product && !uniqueVariants.some(item =>
    String(item.id) === String(product.id)
  )) {
    uniqueVariants.unshift(product);
  }

  const variantContainer = $("bp-variant-list");

  if (!uniqueVariants.length) {
    variantContainer.innerHTML =
      `<div class="bp-no-match">No catalogue variants found.</div>`;
  } else {
    variantContainer.innerHTML = uniqueVariants.map(item => `
      <button
        class="bp-variant-button"
        data-id="${escapeHtml(item.id)}"
      >
        ${escapeHtml(item.variant)} · ${money(item.sellingPrice)}
      </button>
    `).join("");

    variantContainer.querySelectorAll(".bp-variant-button")
      .forEach(button => {
        button.addEventListener("click", () => {
          const selected = uniqueVariants.find(item =>
            String(item.id) === button.dataset.id
          );

          showProduct(selected);
        });
      });
  }

  showProduct(product);

  page.querySelector("#bp-back").addEventListener("click", () => {
    if (history.state?.bestPriceProductPage) {
      history.back();
    } else {
      closeProductPage();
    }
  });
}

// Close page when browser back button is pressed
function closeProductPage() {
  document.querySelector(".bp-product-page")?.remove();
  activeProductPage = false;
}

window.addEventListener("popstate", () => {
  if (activeProductPage) {
    closeProductPage();
  }
});

// Load catalogue
loadProducts();
