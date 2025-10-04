'use client'

import React, { useState, useCallback, useMemo } from 'react';
import { Camera, Upload, Loader2, ListOrdered, XCircle } from 'lucide-react';

// --- Global Variables (Assumed available in the environment) ---
declare const __app_id: string;

// --- Type Definitions ---
interface ParsedItem {
  item: string;
  price: number;
  quantity: number;
}

// --- Utility Functions for Image Processing and API Calls ---

/**
 * Converts a File or Blob object into a Base64 data string.
 * @param file The image file to convert.
 * @returns A promise that resolves with the Base64 data string.
 */
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Extract only the base64 part (remove the data:mime/type;base64,)
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

/**
 * Retries a function that returns a Promise with exponential backoff.
 */
const retryFetch = async (url: string, options: RequestInit, retries = 3): Promise<Response> => {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            // Throw error for non-OK status codes, allowing retry
            throw new Error(`HTTP error! status: ${response.status}`);
        } catch (error) {
            if (i === retries - 1) throw error; // Re-throw on last attempt
            const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    // This line should technically be unreachable
    throw new Error("Retry function failed to return a response."); 
};


// --- Component ---

export default function SnapPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [userError, setUserError] = useState('');

  // API Key is left as an empty string as required, Canvas will provide it at runtime.
  const apiKey = ""; 
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

  // JSON Schema for structured output
  const responseSchema = useMemo(() => ({
    type: "ARRAY",
    description: "A list of line items from the receipt, ignoring tax, tip, and grand totals. Extract item name, single-unit price, and quantity.",
    items: {
      type: "OBJECT",
      properties: {
        "item": { "type": "STRING", "description": "The name or description of the product/service." },
        "price": { "type": "NUMBER", "description": "The single-unit price of the item." },
        "quantity": { "type": "NUMBER", "description": "The number of units purchased (default to 1 if not explicitly listed)." }
      },
      required: ["item", "price", "quantity"]
    }
  }), []);


  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserError('');
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      
      if (!['image/jpeg', 'image/png'].includes(selectedFile.type)) {
        setUserError('Unsupported file type. Please upload a JPG or PNG receipt image.');
        setFile(null);
        setPreviewUrl(null);
        return;
      }
      
      // Clear previous URL object to prevent memory leaks
      if (previewUrl) URL.revokeObjectURL(previewUrl); 

      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setStatusMessage(`Ready to process: ${selectedFile.name}`);
    }
  };
  
  // Handles the full image processing and API call
  const handleProcessReceipt = useCallback(async () => {
    if (!file) {
      setUserError('Please select a receipt image first.');
      return;
    }

    setIsLoading(true);
    setStatusMessage('Processing image and contacting AI...');
    setUserError('');
    
    // Check file size (5MB limit for multimodal input)
    if (file.size > 5 * 1024 * 1024) {
        setUserError("File too large. Please use an image smaller than 5MB.");
        setIsLoading(false);
        return;
    }

    try {
      const base64Data = await fileToBase64(file);
      
      const systemPrompt = "You are a specialized receipt scanner AI. Your task is to accurately extract all distinct purchasable line items from the provided receipt image. Ignore grand totals, sub-totals, discounts, taxes, and tips. Output the result ONLY as a JSON array matching the provided schema.";
      const userQuery = "Extract the line items from this receipt, including the item name, the price of a single unit, and the quantity purchased.";

      const payload = {
          contents: [
              {
                  role: "user",
                  parts: [
                      { text: userQuery },
                      {
                          inlineData: {
                              mimeType: file.type,
                              data: base64Data
                          }
                      }
                  ]
              }
          ],
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          generationConfig: {
              responseMimeType: "application/json",
              responseSchema: responseSchema
          }
      };

      const response = await retryFetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      
      const result = await response.json();
      const candidate = result.candidates?.[0];

      if (candidate && candidate.content?.parts?.[0]?.text) {
        const jsonText = candidate.content.parts[0].text;
        let parsedItems: ParsedItem[];

        try {
            // The API returns the JSON as a string, we must parse it.
            parsedItems = JSON.parse(jsonText); 
        } catch (e: any) {
             // Handle JSON parsing errors (The model returned malformed JSON)
            console.error('Server Error: Malformed JSON response from AI', e);
            console.log('Raw AI Response:', jsonText);
            throw new Error("AI returned malformed data. Please try a clearer receipt.");
        }

        if (parsedItems && parsedItems.length > 0) {
            setStatusMessage('Receipt successfully parsed!');
            
            // Save the parsed data to localStorage for the split page to pick up
            localStorage.setItem('splitItemsData', JSON.stringify(parsedItems));
            
            // Navigate to the split page (should ideally use a proper router, but location works here)
            setTimeout(() => {
              window.location.href = '/split';
            }, 500);
            
        } else {
            // The AI ran, but returned an empty or invalid list
            throw new Error("AI extracted no items. Ensure the receipt text is legible.");
        }
      } else {
        // Handle cases where the API call failed or the candidate structure is missing
        console.error('Server Error:', result.error || 'Unknown server error');
        // This simulates the original error message context
        const errorDetail = result.error?.message || (candidate?.finishReason === 'SAFETY' ? 'Content blocked due to safety settings.' : 'AI processing failed.');
        throw new Error(`Image format error: The uploaded image file type is unsupported or corrupted. Please try a standard JPG or PNG file. (Detail: ${errorDetail})`);
      }

    } catch (error: any) {
      console.error('Processing Failed:', error.message);
      
      // Present a user-friendly error message
      const displayError = "We couldn't read the receipt. Please try another photo, ensure the text is clear, and that the file is not too large.";
      setUserError(displayError);
      setStatusMessage('Processing failed.');
      
    } finally {
      setIsLoading(false);
    }
  }, [file, apiUrl, responseSchema, previewUrl]);


  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-lg p-8 rounded-xl shadow-2xl bg-white dark:bg-gray-800 text-center space-y-8">
        
        <h1 className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center justify-center space-x-2">
            <Camera className="w-8 h-8" />
            <span>SplitSnap: Snap Receipt</span>
        </h1>
        
        <p className="text-gray-600 dark:text-gray-400">
          Upload a clear photo of your receipt to start splitting the bill with friends.
        </p>
        
        {/* File Input Area */}
        <div className="border-4 border-dashed border-gray-200 dark:border-gray-700 p-6 rounded-xl hover:border-indigo-400 transition duration-300 relative">
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileChange}
            disabled={isLoading}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="space-y-3">
            <Upload className="w-10 h-10 text-gray-400 dark:text-gray-500 mx-auto" />
            <p className="text-lg font-medium text-gray-800 dark:text-white">
                Drag & Drop or <span className="text-indigo-600 dark:text-indigo-400 font-bold cursor-pointer">Browse File</span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Max 5MB (JPG or PNG)
            </p>
          </div>
        </div>
        
        {/* File Preview and Status */}
        {file && (
          <div className="flex flex-col items-center space-y-4">
            {previewUrl && (
              <img 
                src={previewUrl} 
                alt="Receipt Preview" 
                className="max-h-60 w-auto rounded-lg shadow-md border-2 border-indigo-400 object-contain"
              />
            )}
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{statusMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {userError && (
          <div className="flex items-center justify-center space-x-2 p-3 bg-red-100 dark:bg-red-900/40 border border-red-400 rounded-lg text-red-700 dark:text-red-300 font-medium">
            <XCircle className="w-5 h-5" />
            <span>{userError}</span>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleProcessReceipt}
          disabled={!file || isLoading}
          className="w-full flex items-center justify-center px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold text-lg shadow-lg hover:bg-indigo-700 transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.01]"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-6 h-6 mr-3 animate-spin" />
              Processing with AI...
            </>
          ) : (
            <>
              <ListOrdered className="w-6 h-6 mr-3" />
              Process & Split Bill
            </>
          )}
        </button>
        
      </div>
    </div>
  );
}
