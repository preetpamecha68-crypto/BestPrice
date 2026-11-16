const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "products.json");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    cb(null, allowed.includes(file.mimetype));
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function getProducts() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function priceDetails(product) {
  const discount = product.mrp > 0
    ? Math.round((1 - product.sellingPrice / product.mrp) * 10000) / 100
    : 0;

  return {
    ...product,
    discount,
    savings: product.mrp - product.sellingPrice
  };
}

// Get all products
app.get("/api/products", (req, res) => {
  const products = getProducts().map(priceDetails);

  res.json({
    products,
    count: products.length
  });
});

// Identify product from uploaded photo
app.post("/api/identify", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: "Please upload a JPG, PNG or WEBP product photo."
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "AI is not configured. Add your OPENAI_API_KEY."
    });
  }

  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const base64 = req.file.buffer.toString("base64");

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Identify the electrical product in the image.
Return JSON with these keys:
brand, product, wattage, shape, colour, confidence.
Use null for details you cannot identify.
Confidence must be a number between 0 and 1.
Never invent unreadable details.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Identify this product and its visible variant."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${req.file.mimetype};base64,${base64}`
              }
            }
          ]
        }
      ],
      max_tokens: 300
    });

    const identified = JSON.parse(
      response.choices[0].message.content || "{}"
    );

    const catalogue = getProducts();

    const normalize = value =>
      String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const brand = normalize(identified.brand);
    const product = normalize(identified.product);
    const wattage = normalize(identified.wattage);

    let candidates = catalogue.filter(item => {
      const brandMatch =
        !brand ||
        normalize(item.brand).includes(brand) ||
        brand.includes(normalize(item.brand));

      const productMatch =
        !product ||
        normalize(item.product).includes(product) ||
        product.includes(normalize(item.product));

      return brandMatch && productMatch;
    });

    if (!candidates.length && brand) {
      candidates = catalogue.filter(item =>
        normalize(item.brand).includes(brand)
      );
    }

    const exact = candidates.find(item =>
      wattage && normalize(item.variant).includes(wattage)
    );

    const matched = exact || candidates[0] || null;

    const variants = matched
      ? catalogue
          .filter(item => item.family === matched.family)
          .map(priceDetails)
      : [];

    res.json({
      identified,
      matched: matched ? priceDetails(matched) : null,
      variants,
      needsConfirmation:
        !matched ||
        !exact ||
        Number(identified.confidence || 0) < 0.75,
      message: !matched
        ? "No catalogue match found. Search manually."
        : exact
          ? "Possible exact match found. Confirm the variant."
          : "Related products found. Select the correct variant."
    });

  } catch (error) {
    console.error("Identification error:", error.message);

    res.status(500).json({
      error: "Could not identify the product. Try a clearer photo."
    });
  }
});

// Update a product price (admin PIN required)
app.patch("/api/products/:id", (req, res) => {
  if (
    !process.env.ADMIN_PIN ||
    req.get("x-admin-pin") !== process.env.ADMIN_PIN
  ) {
    return res.status(401).json({
      error: "Incorrect or missing admin PIN."
    });
  }

  const products = getProducts();
  const index = products.findIndex(
    item => item.id === req.params.id
  );

  if (index === -1) {
    return res.status(404).json({
      error: "Product not found."
    });
  }

  const mrp = Number(req.body.mrp);
  const sellingPrice = Number(req.body.sellingPrice);

  if (
    !Number.isFinite(mrp) ||
    !Number.isFinite(sellingPrice) ||
    mrp < 0 ||
    sellingPrice < 0 ||
    sellingPrice > mrp
  ) {
    return res.status(400).json({
      error: "Enter valid prices. Selling price cannot exceed MRP."
    });
  }

  products[index].mrp = mrp;
  products[index].sellingPrice = sellingPrice;

  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(products, null, 2)
  );

  res.json({
    product: priceDetails(products[index])
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "Rajesh Electric Price Finder"
  });
});

app.listen(PORT, () => {
  console.log(`Rajesh Electric app running on port ${PORT}`);
});
