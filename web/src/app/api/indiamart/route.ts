import { NextResponse } from "next/server";

type AgentMode = "simulate" | "live";

type AgentSettings = {
  apiKey?: string;
  sellerId?: string;
  baseUrl?: string;
  mode?: AgentMode;
};

type ProductPayload = {
  title: string;
  category?: string;
  price?: string;
  currency?: string;
  unit?: string;
  stock?: string;
  minOrderQty?: string;
  keywords?: string[];
  imageUrls?: string[];
  shortDescription?: string;
  description?: string;
  features?: string[];
  packaging?: string;
  leadTime?: string;
};

type RequestBody = {
  settings?: AgentSettings;
  product?: ProductPayload;
};

const MINIMUM_FIELDS: (keyof ProductPayload)[] = ["title", "description", "shortDescription"];

const buildIndiaMartPayload = (product: ProductPayload, settings: AgentSettings) => {
  const featuresText = product.features?.join("|") ?? "";
  return {
    PRODUCT_NAME: product.title,
    SELLER_ID: settings.sellerId ?? "",
    CURRENCY_TYPE: product.currency ?? "INR",
    YOUR_PRICE: product.price ?? "",
    UNIT: product.unit ?? "",
    MIN_ORDER_QUANTITY: product.minOrderQty ?? "",
    PACKAGE_DETAILS: product.packaging ?? "",
    SUPPLY_ABILITY: product.stock ?? "",
    DELIVERY_TIME: product.leadTime ?? "",
    SHORT_DESC: product.shortDescription ?? "",
    LONG_DESC: product.description ?? "",
    KEY_FEATURES: featuresText,
    KEYWORDS: product.keywords?.join(",") ?? "",
    IMAGE1: product.imageUrls?.[0] ?? "",
    IMAGE2: product.imageUrls?.[1] ?? "",
    IMAGE3: product.imageUrls?.[2] ?? "",
    CATEGORY: product.category ?? "",
  };
};

export async function POST(request: Request) {
  let body: RequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload received." }, { status: 400 });
  }

  const product = body.product;
  const settings = body.settings;

  if (!product) {
    return NextResponse.json({ error: "Product payload not provided." }, { status: 400 });
  }

  const missingFields = MINIMUM_FIELDS.filter((field) => {
    const value = product[field];
    return value === undefined || value === null || value === "";
  });

  if (missingFields.length) {
    return NextResponse.json(
      {
        error: `Missing required product fields: ${missingFields.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const normalizedSettings: AgentSettings = {
    apiKey: settings?.apiKey?.trim(),
    sellerId: settings?.sellerId?.trim(),
    baseUrl: settings?.baseUrl?.trim(),
    mode: settings?.mode ?? "simulate",
  };

  const preparedPayload = buildIndiaMartPayload(product, normalizedSettings);

  if (normalizedSettings.mode === "simulate") {
    return NextResponse.json(
      {
        status: "simulated",
        payload: preparedPayload,
      },
      { status: 200 },
    );
  }

  if (!normalizedSettings.apiKey) {
    return NextResponse.json({ error: "API key is required in live mode." }, { status: 400 });
  }

  if (!normalizedSettings.sellerId) {
    return NextResponse.json({ error: "Seller ID is required in live mode." }, { status: 400 });
  }

  const endpoint = normalizedSettings.baseUrl || "https://sellerapi.indiamart.com/catalog/v1/product/add";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authtoken: normalizedSettings.apiKey,
      },
      body: JSON.stringify(preparedPayload),
    });

    const contentType = response.headers.get("content-type");
    const responsePayload =
      contentType && contentType.includes("application/json") ? await response.json() : await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "IndiaMART API returned an error.",
          status: response.status,
          response: responsePayload,
        },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        status: "success",
        response: responsePayload,
      },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error while reaching IndiaMART.";
    return NextResponse.json(
      {
        error: message,
      },
      { status: 504 },
    );
  }
}
