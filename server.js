const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const PRODUCTS_FILE = path.join(__dirname, "products.json");
const GEMINI_MODEL = "gemini-2.5-flash-lite";

app.use(express.json({ limit: "2mb" }));

// Serve frontend files
app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"],
  maxAge: "1h"
}));

// Support both common CSS filenames
app.get(["/style.css", "/styles.css"], (req, res, next) => {
  const candidates = [
    path.join(PUBLIC_DIR, "styles.css"),
    path.join(PUBLIC_DIR, "style.css")
  ];

  const cssFile = candidates.find(file => fs.existsSync(file));

  if (!cssFile) {
    return res.status(404).send("Stylesheet not found in public folder.");
  }

  res.type("text/css");
  res.sendFile(cssFile);
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];

    if (!allowed.includes(file.mimetype)) {
      return callback(new Error("Upload JPG, PNG or WEBP only."));
    }

    callback(null, true);
  }
});

let geminiClient;

async function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_NOT_CONFIGURED");
  }

  if (!geminiClient) {
    const { GoogleGenAI } = await import("@google/genai");

    geminiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
  }

  return geminiClient;
}

function readProducts() {
  const products = JSON.parse(
    fs.readFileSync(PRODUCTS_FILE, "utf8")
  );

  if (!Array.isArray(products)) {
    throw new Error("Catalogue must be an array.");
  }

  return products;
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function addPriceDetails(product) {
  const mrp = Number(product.mrp);
  const sellingPrice = Number(product.sellingPrice);

  return {
    ...product,
    savings: mrp - sellingPrice,
    discount: mrp > 0
      ? Number(((mrp - sellingPrice) / mrp * 100).toFixed(2))
      : 0
  };
}

function securePinMatches(provided, actual) {
  if (!provided || !actual) return false;

  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(actual));

  return a.length === b.length &&
    crypto.timingSafeEqual(a, b);
}

function parseGeminiJSON(text) {
  return JSON.parse(
    String(text || "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim()
  );
}

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    aiEngine: "Gemini",
    aiConfigured: Boolean(process.env.GEMINI_API_KEY)
  });
});

// Product catalogue
app.get("/api/products", (req, res) => {
  try {
    const products = readProducts().map(addPriceDetails);

    res.json({
      products,
      count: products.length
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Could not load products."
    });
  }
});

// AI product identification
app.post("/api/identify", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "Please upload a product image."
      });
    }

    const ai = await getGeminiClient();

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [{
        role: "user",
        parts: [
          {
            text: `
Identify the electrical or hardware product in this photograph.

Return ONLY JSON:
{
  "brand": "brand name or unknown",
  "product": "product type or unknown",
  "variant": "visible wattage, size or variant or unknown",
  "confidence": "high, medium, or low"
}

Never invent specifications.
If something is unclear, return unknown.
`
          },
          {
            inlineData: {
              mimeType: req.file.mimetype,
              data: req.file.buffer.toString("base64")
            }
          }
        ]
      }],
      config: {
        responseMimeType: "application/json"
      }
    });

    const identified = parseGeminiJSON(response.text);
    const products = readProducts();

    const sameFamily = products.filter(product =>
      normalize(product.brand) === normalize(identified.brand) &&
      normalize(product.product) === normalize(identified.product)
    );

    const matchedProduct = sameFamily.find(product =>
      normalize(product.variant) === normalize(identified.variant)
    );

    const matched = matchedProduct
      ? addPriceDetails(matchedProduct)
      : null;

    const variants = sameFamily.map(addPriceDetails);

    res.json({
      identified,
      matched,
      match: matched,
      product: matched,
      variants,
      alternatives: variants,
      needsConfirmation: !matched ||
        String(identified.confidence).toLowerCase() === "low",
      message: matched
        ? "Possible match found. Verify the product and variant."
        : sameFamily.length
          ? "Product family found. Select the correct variant."
          : "No catalogue match found. Search manually."
    });

  } catch (error) {
    console.error("Identification error:", error.message);

    res.status(
      error.message === "GEMINI_NOT_CONFIGURED" ? 503 : 500
    ).json({
      error: error.message === "GEMINI_NOT_CONFIGURED"
        ? "Gemini API is not configured."
        : "Product identification failed."
    });
  }
});

// Admin product update
app.patch("/api/products/:id", async (req, res) => {
  try {
    if (!securePinMatches(
      req.headers["x-admin-pin"],
      process.env.ADMIN_PIN
    )) {
      return res.status(401).json({
        error: "Invalid admin PIN."
      });
    }

    const products = readProducts();

    const index = products.findIndex(product =>
      String(product.id) === String(req.params.id)
    );

    if (index === -1) {
      return res.status(404).json({
        error: "Product not found."
      });
    }

    const allowed = [
      "brand",
      "product",
      "variant",
      "mrp",
      "sellingPrice",
      "family"
    ];

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        products[index][field] = req.body[field];
      }
    }

    await fs.promises.writeFile(
      PRODUCTS_FILE,
      JSON.stringify(products, null, 2)
    );

    res.json({
      message: "Product updated.",
      product: addPriceDetails(products[index])
    });

  } catch (error) {
    console.error("Update error:", error.message);

    res.status(500).json({
      error: "Could not update product."
    });
  }
});

// Error handling
app.use((error, req, res, next) => {
  console.error(error.message);

  res.status(400).json({
    error: error.message || "Request failed."
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Rajesh Electric running on port ${PORT}`);
});
