// snapsplit/app/page.tsx

import Link from 'next/link';
import { Camera, History } from 'lucide-react';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 md:p-12 bg-gray-50 dark:bg-gray-900 transition-colors duration-500">
      <div className="w-full max-w-xl text-center space-y-12">
        
        {/* Logo/Title Section */}
        <header className="space-y-3">
          <h1 className="text-6xl md:text-7xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 tracking-tighter transition duration-500">
            SnapSplit
          </h1>
          <p className="text-xl text-gray-700 dark:text-gray-300 max-w-md mx-auto font-medium">
            The instant, zero-friction way to split bills and expenses.
          </p>
        </header>
        
        {/* Core Action: The Professional Snap Button */}
        <div className="pt-4">
          <Link href="/snap">
            <button
              className="w-full sm:w-4/5 lg:w-3/4 flex items-center justify-center mx-auto space-x-3 
                         px-8 py-5 text-xl font-bold text-white 
                         bg-emerald-500 rounded-2xl shadow-2xl shadow-emerald-300/60 dark:shadow-emerald-700/50
                         hover:bg-emerald-600 transition duration-300 ease-in-out 
                         transform hover:scale-[1.03] active:scale-[0.98] 
                         focus:outline-none focus:ring-4 focus:ring-emerald-300"
            >
              <Camera className="w-6 h-6" />
              <span>Snap a Receipt to Start</span>
            </button>
          </Link>
        </div>

        {/* --- Feature Callouts (Explaining the UX idea) --- */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">
                Designed for Speed. Built for Trust.
            </h3>
            <div className="flex justify-center space-x-6">
                
                {/* Feature 1: No Barrier */}
                <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-md flex-1 min-w-0">
                    <p className="font-bold text-indigo-500 text-sm mb-1">NO BARRIER START</p>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                        Instantly split bills without sign-up. Speed is everything.
                    </p>
                </div>
                
                {/* Feature 2: Optional History */}
                <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-md flex-1 min-w-0">
                    <p className="font-bold text-purple-500 text-sm mb-1">OPTIONAL HISTORY</p>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                        Sign up only when you want to save transactions.
                    </p>
                </div>
            </div>
        </div>

        {/* Optional Sign-Up/Login Link */}
        <footer className="pt-4">
          <Link 
            href="/login" 
            className="flex items-center justify-center space-x-2 text-md font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 transition duration-150"
          >
            <History className="w-5 h-5"/>
            <span>Access Saved Transaction History</span>
          </Link>
        </footer>
      </div>
    </main>
  );
}