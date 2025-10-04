'use client'

import { useState } from 'react';
import { UploadCloud, X, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
// NOTE: We will use a router hook in the next step, but for now, we use a mock structure.

// Define the expected types for the structured data
interface ParsedItem {
  item: string;
  price: number;
  quantity: number;
}

// Define the expected image types
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

export default function SnapPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(''); 
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]); // New state for structured data

  // New validation logic
  const validateAndSetFile = (selectedFile: File | null) => {
    setErrorMessage('');
    if (selectedFile) {
      if (!ALLOWED_MIME_TYPES.includes(selectedFile.type)) {
        setErrorMessage('Unsupported file type. Please upload a JPG, PNG, or HEIC image.');
        setFile(null);
        return;
      }
    }
    setFile(selectedFile);
  };

  const handleFileChange = (selectedFile: File | null) => {
    validateAndSetFile(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      validateAndSetFile(files[0]);
    }
  };

  const handleProcessReceipt = async () => {
    if (!file) return;

    setLoading(true);
    setErrorMessage('');
    setParsedItems([]); // Clear previous results

    const formData = new FormData();
    formData.append('receipt', file);

    try {
      // 1. Send the file to the secure API Route
      const response = await fetch('/api/ocr', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        // Log the technical error to the console for developers
        console.error('Server Error:', result.error || 'Unknown server error');
        
        // Use a generic, user-friendly error for the user
        const displayError = "We couldn't read the receipt. Please try another photo, ensure the text is clear, and that the file is not too large.";
        
        throw new Error(displayError);
      }

      // 2. Success! The structured JSON data is returned.
      const structuredData = result.structuredData as ParsedItem[];
      console.log("Structured OCR Result:", structuredData);

      setParsedItems(structuredData);

      // 3. Display the parsed data (will be replaced by navigation in the next step)
      const preview = structuredData.map(item => `${item.item} ($${item.price.toFixed(2)})`).join('\n');
      alert(`OCR & AI Parsing Successful! Found ${structuredData.length} items.\n\nParsed Items:\n${preview}`);
      
    } catch (error) {
      // Display the user-friendly error
      setErrorMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-900">
      
      {/* Back Button */}
      <Link href="/" className="absolute top-6 left-6 text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 transition duration-150 flex items-center space-x-1">
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Home</span>
      </Link>

      <div className="w-full max-w-lg bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl space-y-8">
        
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center">
          Step 1: Snap or Upload Receipt
        </h2>
        <p className="text-center text-gray-600 dark:text-gray-400">
          We use AI to instantly read all the items and prices.
        </p>

        {/* Error Message Display */}
        {errorMessage && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg text-center font-medium">
                {errorMessage}
            </div>
        )}

        {file ? (
          // --- File Preview State ---
          <div className="border-2 border-dashed border-indigo-300 dark:border-indigo-600 p-6 rounded-lg bg-indigo-50 dark:bg-indigo-900/50 space-y-4">
            <div className="flex justify-between items-center">
              <span className="font-medium text-gray-800 dark:text-white truncate">
                {file.name}
              </span>
              <button onClick={() => setFile(null)} className="text-red-500 hover:text-red-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={handleProcessReceipt}
              disabled={loading}
              className="w-full py-3 text-lg font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 transition disabled:bg-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              {loading ? 'Reading Receipt...' : 'Process Receipt Now'}
            </button>
            
            {/* Display Parsed Items (Temporary Preview) */}
            {parsedItems.length > 0 && (
                <div className="mt-4 p-4 border border-indigo-300 rounded-lg bg-white dark:bg-gray-700 max-h-40 overflow-y-auto">
                    <h4 className="font-semibold text-gray-900 dark:text-white mb-2">AI Parsed Items:</h4>
                    {parsedItems.map((item, index) => (
                        <div key={index} className="flex justify-between text-sm text-gray-700 dark:text-gray-300">
                            <span>{item.quantity} x {item.item}</span>
                            <span className="font-mono">${item.price.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            )}

          </div>
        ) : (
          // --- Drag & Drop/Upload State ---
          <label 
            htmlFor="receipt-upload"
            className={`flex flex-col items-center justify-center h-56 border-2 border-dashed rounded-xl cursor-pointer transition-colors duration-300 ${
              isDragging 
                ? 'border-indigo-500 bg-indigo-100 dark:bg-indigo-900' 
                : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <UploadCloud className="w-10 h-10 text-indigo-500 dark:text-indigo-400 mb-2" />
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              Drag & Drop or Click to Upload
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              (JPG, PNG, or HEIC file from your phone)
            </p>
            <input 
              id="receipt-upload" 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />
          </label>
        )}
      </div>
    </div>
  );
}
