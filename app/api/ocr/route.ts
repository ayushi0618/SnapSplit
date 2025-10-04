
import { NextRequest, NextResponse } from 'next/server';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import { GoogleGenAI } from '@google/genai';

const GOOGLE_VISION_KEY_JSON_STRING = process.env.GOOGLE_CLOUD_KEY_JSON;
// Gemini API Key is stored separately
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 

// --- Configuration for Structured Output ---
const receiptSchema = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      item: { type: "STRING", description: "The name of the item purchased." },
      price: { type: "NUMBER", description: "The unit price of the item." },
      quantity: { type: "NUMBER", description: "The quantity of the item purchased (default 1)." },
    },
    required: ["item", "price"],
  },
};

// --- Helper Function ---
function bufferToDataURL(buffer: ArrayBuffer): string {
  const imageBuffer = Buffer.from(buffer);
  return imageBuffer.toString('base64');
}

// ----------------------------------------------------------------------
// POST /api/ocr
// ----------------------------------------------------------------------
export async function POST(req: NextRequest) {
  // 1. Validate Gemini Key
  if (!GEMINI_API_KEY) {
    console.error('SERVER ERROR: GEMINI_API_KEY environment variable is missing.');
    return NextResponse.json(
      { error: 'Server configuration error: Gemini API Key is missing.' },
      { status: 500 }
    );
  }

  // 2. Vision Client Initialization (Same as before)
  let visionCredentials;
  if (!GOOGLE_VISION_KEY_JSON_STRING) {
    return NextResponse.json(
      { error: 'Server configuration error: OCR Key is missing.' },
      { status: 500 }
    );
  }
  try {
    visionCredentials = JSON.parse(GOOGLE_VISION_KEY_JSON_STRING);
  } catch (parseError) {
    return NextResponse.json(
      { error: 'Server configuration error: Invalid OCR Key format.' },
      { status: 500 }
    );
  }

  try {
    const formData = await req.formData();
    const file = formData.get('receipt') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }
    
    // --- Step A: Get Raw Text from Vision API (OCR) ---
    const arrayBuffer = await file.arrayBuffer();
    const imageContent = bufferToDataURL(arrayBuffer);
    const visionClient = new ImageAnnotatorClient({ credentials: visionCredentials });

    const [visionResult] = await visionClient.documentTextDetection({
      image: { content: imageContent },
    });

    const rawReceiptText = visionResult.fullTextAnnotation?.text;

    if (!rawReceiptText) {
      return NextResponse.json({ error: 'Could not detect text in the image. Please try a clearer photo.' }, { status: 400 });
    }

    // --- Step B: Parse Raw Text into Structured JSON using Gemini ---
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    const prompt = `You are a specialized receipt parsing assistant. Convert the following raw text from a receipt into a structured JSON array. Focus only on line items, unit price, and quantity. Ignore taxes, totals, and promotional lines. Set quantity to 1 if not explicitly listed. Raw Text:\n\n---\n${rawReceiptText}`;

    const geminiResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: receiptSchema,
        },
    });

    // The response text is a JSON string conforming to the schema
    const structuredJsonString = geminiResponse.text;
    const structuredData = JSON.parse(structuredJsonString);
    
    // --- Step C: Send the final structured data back to the client ---
    return NextResponse.json({
      success: true,
      structuredData: structuredData,
    });

  } catch (e) {
    console.error('Full AI Processing Error:', e);
    
    // Check for the known image format error
    if (String(e).includes('unsupported')) {
        return NextResponse.json(
            { error: 'Image format error: The uploaded image file type is unsupported or corrupted. Please try a standard JPG or PNG file.' },
            { status: 500 }
        );
    }
    // General error for the user
    return NextResponse.json(
      { error: "A server error occurred during AI processing. Please check the console for details." },
      { status: 500 }
    );
  }
}
