'use client'; // CRITICAL: Tells Next.js to render this component on the client side because it uses hooks, state, and browser APIs.

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, collection, onSnapshot, setDoc, deleteDoc, query, orderBy, serverTimestamp, arrayUnion, arrayRemove } from 'firebase/firestore';
import { Plus, X, Trash2, ChevronDown, ChevronUp, Users, DollarSign, Loader2 } from 'lucide-react';

// --- Global Firebase Configuration and Utility Hooks ---

/**
 * Initializes and authenticates Firebase.
 * @returns {{db: Firestore|null, auth: Auth|null, userId: string|null, isAuthReady: boolean, appId: string, error: string|null}}
 */
const useFirebaseInit = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [error, setError] = useState(null);

    const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    // CRITICAL FIX: Clean and ensure appId is a single, safe path segment, resolving the 9-segment error.
    const appId = rawAppId.split('/')[0].replace(/[^a-zA-Z0-9_-]/g, '-');
    
    useEffect(() => {
        let unsubscribeAuth;
        try {
            const firebaseConfig = JSON.parse(typeof __firebase_config !== 'undefined' ? __firebase_config : '{}');
            if (Object.keys(firebaseConfig).length === 0) {
                console.error("Firebase config is empty.");
                return;
            }

            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);

            setDb(firestoreDb);
            setAuth(firebaseAuth);

            unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        // Sign in anonymously if no user is present
                        const anonUser = await signInAnonymously(firebaseAuth);
                        setUserId(anonUser.user.uid);
                    } catch (e) {
                        console.error("Anonymous sign-in failed:", e);
                        setError("Failed to sign in anonymously.");
                    }
                }
                setIsAuthReady(true);
            });

            // Attempt custom token sign-in if available
            const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
            if (initialAuthToken && initialAuthToken !== 'null') {
                signInWithCustomToken(firebaseAuth, initialAuthToken).catch(e => {
                    console.warn("Custom token sign-in failed, proceeding with anonymous sign-in.", e);
                });
            }

        } catch (e) {
            console.error("Firebase initialization failed:", e);
            setError("Firebase initialization failed.");
        }
        
        return () => {
            if (unsubscribeAuth) unsubscribeAuth();
        };
    }, [appId]);

    return { db, auth, userId, isAuthReady, appId, error };
};

// --- Firestore Path Construction (Corrected) ---

/** Gets the correct path for the public 'splits' collection (5 segments). */
const getSplitsCollectionRef = (db, appId) => {
    if (!db || !appId) return null;
    // Path: artifacts/{appId}/public/data/splits
    return collection(db, `artifacts/${appId}/public/data/splits`);
};

/** Gets the correct path for a specific split document (7 segments). */
const getSplitDocRef = (db, appId, splitId) => {
    if (!db || !appId || !splitId) return null;
    // Path: artifacts/{appId}/public/data/splits/{splitId}
    return doc(db, `artifacts/${appId}/public/data/splits`, splitId);
};


// --- UI Components ---

// NOTE: Tailwind CSS classes used directly in JSX, assuming standard Next.js setup or included CDN

const Button = ({ children, onClick, className = '', disabled = false, icon: Icon = null }) => (
    <button
        onClick={onClick}
        disabled={disabled}
        className={`flex items-center justify-center space-x-2 px-4 py-2 font-medium rounded-xl transition duration-200 shadow-lg 
                    ${disabled ? 'bg-gray-400 text-gray-700 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-[0.98]'}
                    ${className}`}
    >
        {Icon && <Icon className="w-5 h-5" />}
        <span>{children}</span>
    </button>
);

const Input = React.forwardRef(({ value, onChange, placeholder, type = 'text', className = '' }, ref) => (
    <input
        ref={ref}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full p-3 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all ${className}`}
    />
));

const Card = ({ children, className = '' }) => (
    <div className={`bg-white p-6 rounded-2xl shadow-xl ${className}`}>
        {children}
    </div>
);

// --- Core Split Logic ---

/**
 * Calculates the total balance for each participant.
 * @param {object} split - The split object from Firestore.
 * @returns {{totalAmount: number, balances: Array<{id: string, name: string, netBalance: number}>}}
 */
const calculateBalances = (split) => {
    // Sanitize data
    const items = split.items || [];
    const participants = split.participants || [];
    const payments = split.payments || [];

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    const participantCount = participants.length;

    if (totalAmount === 0 || participantCount === 0) {
        return { totalAmount: 0, balances: [] };
    }

    // 1. Calculate the share each person owes
    const sharePerPerson = totalAmount / participantCount;

    const balances = participants.map(p => {
        // 2. Find the amount the person paid
        const paidItem = payments.find(pm => pm.id === p.id);
        const amountPaid = paidItem ? paidItem.amount : 0;

        // 3. Calculate net balance: (Amount Paid) - (Share Owed)
        // Positive netBalance means the person is owed money (paid more than share)
        // Negative netBalance means the person owes money (paid less than share)
        let netBalance = amountPaid - sharePerPerson;

        return {
            id: p.id,
            name: p.name,
            netBalance: parseFloat(netBalance.toFixed(2)), // Round to two decimal places for currency
        };
    });

    return { totalAmount: parseFloat(totalAmount.toFixed(2)), balances };
};

const formatCurrency = (amount) => {
    // Ensures display format is consistent
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};


const SplitDetail = ({ split, db, appId, userId }) => {
    const [isAddingItem, setIsAddingItem] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', amount: 0, paidBy: userId });
    const [isAddingPayment, setIsAddingPayment] = useState(false);
    const [newPayment, setNewPayment] = useState({ id: userId, amount: 0 });
    const [isExpanded, setIsExpanded] = useState(false);
    const [message, setMessage] = useState('');

    const { totalAmount, balances } = useMemo(() => calculateBalances(split), [split]);

    // Ensure the current user is always a participant
    useEffect(() => {
        const splitDocRef = getSplitDocRef(db, appId, split.id);
        if (userId && splitDocRef && !split.participants.some(p => p.id === userId)) {
            // Automatically add current user as a participant (using userId as the name for simplicity)
            setDoc(splitDocRef, {
                participants: arrayUnion({ id: userId, name: userId }),
            }, { merge: true }).catch(console.error);
        }
    }, [userId, split.id, split.participants, db, appId]);


    const handleAddItem = useCallback(async () => {
        if (!newItem.name.trim() || newItem.amount <= 0 || !db) {
            setMessage("Please enter a valid name and amount.");
            return;
        }
        setMessage('');

        const splitDocRef = getSplitDocRef(db, appId, split.id);
        if (!splitDocRef) return;

        try {
            await setDoc(splitDocRef, {
                items: arrayUnion({
                    id: crypto.randomUUID(),
                    name: newItem.name.trim(),
                    amount: parseFloat(newItem.amount),
                    paidBy: newItem.paidBy,
                }),
            }, { merge: true });
            setNewItem({ name: '', amount: 0, paidBy: userId });
            setIsAddingItem(false);
            setMessage("Expense added successfully!");
        } catch (e) {
            console.error("Error adding item: ", e);
            setMessage("Failed to add expense.");
        }
    }, [newItem, db, appId, split.id, userId]);

    const handleUpdatePayment = useCallback(async () => {
        if (!newPayment.id || newPayment.amount < 0 || !db) {
            setMessage("Please select a payer and enter a valid amount.");
            return;
        }
        setMessage('');

        const splitDocRef = getSplitDocRef(db, appId, split.id);
        if (!splitDocRef) return;

        const payer = split.participants.find(p => p.id === newPayment.id);
        if (!payer) {
            setMessage("Selected payer not found.");
            return;
        }

        const existingPaymentIndex = split.payments.findIndex(p => p.id === newPayment.id);
        const updatedPayments = [...split.payments];

        const paymentData = { id: newPayment.id, name: payer.name, amount: parseFloat(newPayment.amount.toFixed(2)) };

        if (existingPaymentIndex > -1) {
            if (newPayment.amount === 0) {
                updatedPayments.splice(existingPaymentIndex, 1);
            } else {
                updatedPayments[existingPaymentIndex] = paymentData;
            }
        } else if (newPayment.amount > 0) {
            updatedPayments.push(paymentData);
        }

        try {
            await setDoc(splitDocRef, { payments: updatedPayments }, { merge: true });
            setNewPayment({ id: userId, amount: 0 });
            setIsAddingPayment(false);
            setMessage("Payment updated successfully!");
        } catch (e) {
            console.error("Error updating payment: ", e);
            setMessage("Failed to update payment.");
        }
    }, [newPayment, db, appId, split.id, split.payments, split.participants, userId]);

    const handleDeleteSplit = useCallback(async () => {
        if (!db) return;

        // Custom modal replacement for confirm()
        const userConfirmed = window.prompt(`Are you sure you want to delete the split "${split.name}"? Type YES to confirm.`);
        
        if (userConfirmed !== 'YES') {
            setMessage(`Deletion of '${split.name}' cancelled.`);
            return;
        }
        setMessage('');

        const splitDocRef = getSplitDocRef(db, appId, split.id);
        if (splitDocRef) {
            try {
                await deleteDoc(splitDocRef);
            } catch (e) {
                console.error("Error deleting split: ", e);
                setMessage("Failed to delete split.");
            }
        }
    }, [db, appId, split.id, split.name]);

    const handleRemoveItem = useCallback(async (itemToRemove) => {
        const splitDocRef = getSplitDocRef(db, appId, split.id);
        if (!splitDocRef) return;

        try {
            // Use arrayRemove to safely remove the item object from the array
            await setDoc(splitDocRef, { items: arrayRemove(itemToRemove) }, { merge: true });
            setMessage("Item removed successfully.");
        } catch (e) {
            console.error("Error removing item: ", e);
            setMessage("Failed to remove item.");
        }
    }, [db, appId, split.id]);

    const BalanceDisplay = ({ balance }) => {
        const isOwed = balance.netBalance > 0.01; // user is owed money
        const owes = balance.netBalance < -0.01;  // user owes money

        const nameDisplay = split.participants.find(p => p.id === balance.id)?.name || balance.id;

        return (
            <div className={`flex justify-between items-center p-2 rounded-xl transition-colors text-sm ${isOwed ? 'bg-green-100' : owes ? 'bg-red-100' : 'bg-gray-100'}`}>
                <span className="font-semibold truncate">{nameDisplay} {balance.id === userId && '(You)'}</span>
                <span className={`font-bold ${isOwed ? 'text-green-700' : owes ? 'text-red-700' : 'text-gray-600'}`}>
                    {isOwed && 'Gets back '}
                    {owes && 'Owes '}
                    {formatCurrency(Math.abs(balance.netBalance))}
                </span>
            </div>
        );
    };

    return (
        <Card className="mb-6 border-2 border-indigo-100">
             {message && (
                <div className={`mb-4 p-3 ${message.includes('success') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} rounded-lg text-sm transition-all`}>
                    {message}
                </div>
            )}
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-extrabold text-indigo-800 break-words max-w-xs">{split.name}</h2>
                    <p className="text-sm text-gray-500 mt-1">Total Expenses: <span className="font-bold text-indigo-600">{formatCurrency(totalAmount)}</span></p>
                </div>
                <div className="flex space-x-2">
                    <button onClick={handleDeleteSplit} className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition">
                        <Trash2 className="w-5 h-5" />
                    </button>
                    <button onClick={() => setIsExpanded(!isExpanded)} className="text-indigo-500 hover:text-indigo-700 p-2 rounded-full hover:bg-indigo-50 transition">
                        {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="mt-4 pt-4 border-t border-indigo-200 space-y-6">
                    {/* Balances Section */}
                    <div className='space-y-3'>
                        <h3 className="text-lg font-bold text-indigo-700 flex items-center"><DollarSign className="w-4 h-4 mr-1"/> Balances</h3>
                        <div className="space-y-2">
                            {balances.filter(b => Math.abs(b.netBalance) > 0.01).map((b) => (
                                <BalanceDisplay key={b.id} balance={b} />
                            ))}
                            {balances.filter(b => Math.abs(b.netBalance) > 0.01).length === 0 && (
                                <p className="text-center text-gray-500 bg-gray-50 p-2 rounded-lg">Everyone settled up!</p>
                            )}
                        </div>
                    </div>

                    {/* Participants */}
                    <div className='space-y-3'>
                        <h3 className="text-lg font-bold text-indigo-700 flex items-center"><Users className="w-4 h-4 mr-1"/> Participants ({split.participants.length})</h3>
                        <div className="flex flex-wrap gap-2">
                            {split.participants.map(p => (
                                <span key={p.id} className="text-xs bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-medium">
                                    {p.name} {p.id === userId && '(You)'}
                                </span>
                            ))}
                        </div>
                    </div>

                    {/* Add Item/Payment Buttons */}
                    <div className="flex space-x-3 pt-2">
                        <Button onClick={() => { setIsAddingItem(true); setIsAddingPayment(false); }} className="flex-1 bg-green-500 hover:bg-green-600">
                            Add Expense
                        </Button>
                        <Button onClick={() => { setIsAddingPayment(true); setIsAddingItem(false); }} className="flex-1 bg-purple-500 hover:bg-purple-600">
                            Update Payments
                        </Button>
                    </div>

                    {/* Add Item Form */}
                    {isAddingItem && (
                        <Card className="mt-4 bg-gray-50 p-4 border border-indigo-200">
                            <h4 className="font-semibold text-indigo-700 mb-3">New Expense</h4>
                            <div className="space-y-3">
                                <Input
                                    placeholder="Description (e.g., Groceries)"
                                    value={newItem.name}
                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                />
                                <Input
                                    type="number"
                                    placeholder="Amount"
                                    value={newItem.amount > 0 ? newItem.amount : ''}
                                    onChange={(e) => setNewItem({ ...newItem, amount: parseFloat(e.target.value) || 0 })}
                                />
                                <select
                                    value={newItem.paidBy}
                                    onChange={(e) => setNewItem({ ...newItem, paidBy: e.target.value })}
                                    className="w-full p-3 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    {split.participants.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} {p.id === userId && '(You)'}</option>
                                    ))}
                                </select>
                                <div className="flex space-x-2">
                                    <Button onClick={handleAddItem} disabled={!newItem.name || newItem.amount <= 0} className="flex-1 bg-green-500 hover:bg-green-600">
                                        Save Expense
                                    </Button>
                                    <Button onClick={() => setIsAddingItem(false)} className="bg-gray-500 hover:bg-gray-600">
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Add Payment Form */}
                    {isAddingPayment && (
                        <Card className="mt-4 bg-gray-50 p-4 border border-indigo-200">
                            <h4 className="font-semibold text-indigo-700 mb-3">Update Payment</h4>
                            <div className="space-y-3">
                                <select
                                    value={newPayment.id}
                                    onChange={(e) => setNewPayment({ ...newPayment, id: e.target.value })}
                                    className="w-full p-3 border border-indigo-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    {split.participants.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} {p.id === userId && '(You)'}</option>
                                    ))}
                                </select>
                                <Input
                                    type="number"
                                    placeholder="Total Amount PAID by this person"
                                    value={newPayment.amount > 0 ? newPayment.amount : ''}
                                    onChange={(e) => setNewPayment({ ...newPayment, amount: parseFloat(e.target.value) || 0 })}
                                />
                                <div className="flex space-x-2">
                                    <Button onClick={handleUpdatePayment} disabled={!newPayment.id || newPayment.amount < 0} className="flex-1 bg-purple-500 hover:bg-purple-600">
                                        Update Payment
                                    </Button>
                                    <Button onClick={() => setIsAddingPayment(false)} className="bg-gray-500 hover:bg-gray-600">
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    )}

                    {/* Items List */}
                    <div className='space-y-3'>
                        <h3 className="text-lg font-bold text-indigo-700 pt-2 border-t border-indigo-200">Expenses List</h3>
                        <div className="space-y-2">
                            {split.items.length === 0 ? (
                                <p className="text-gray-500 text-center p-2 bg-gray-50 rounded-lg">No expenses added yet.</p>
                            ) : (
                                split.items.map(item => (
                                    <div key={item.id} className="flex justify-between items-center p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
                                        <div className="flex-1 truncate">
                                            <p className="font-medium text-gray-800 truncate">{item.name}</p>
                                            <p className="text-xs text-gray-500">Paid by: {split.participants.find(p => p.id === item.paidBy)?.name || item.paidBy}</p>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className="font-semibold text-indigo-600 min-w-[70px] text-right">{formatCurrency(item.amount)}</span>
                                            <button onClick={() => handleRemoveItem(item)} className="text-red-400 hover:text-red-600" title="Remove Expense">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
};

// --- Main App Component ---

const SplitWisePage = () => {
    const { db, userId, isAuthReady, appId, error: initError } = useFirebaseInit();
    const [splits, setSplits] = useState([]);
    const [newSplitName, setNewSplitName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState('');

    // Fetch and listen to splits data
    useEffect(() => {
        if (!db || !isAuthReady || !userId) {
            if (isAuthReady) setLoading(false);
            return;
        }

        const splitsCollectionRef = getSplitsCollectionRef(db, appId);
        if (!splitsCollectionRef) {
            setError("Could not resolve splits collection path.");
            setLoading(false);
            return;
        }

        const q = query(splitsCollectionRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedSplits = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    // Ensure required arrays exist for safety in the UI
                    participants: data.participants || [],
                    items: data.items || [],
                    payments: data.payments || [],
                };
            });
            
            setSplits(fetchedSplits);
            setLoading(false);
        }, (e) => {
            console.error("Firestore error:", e);
            setError("Failed to load data. Please check console for details.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, isAuthReady, userId, appId]);

    const handleCreateSplit = async () => {
        if (!newSplitName.trim() || !db || !userId) {
            setMessage("Please enter a valid name.");
            return;
        }
        setMessage('');

        setLoading(true);
        try {
            const initialUserName = userId; // Fallback to user ID as name if no user profile exists
            
            const newSplitData = {
                name: newSplitName.trim(),
                createdAt: serverTimestamp(),
                createdBy: userId,
                // Initialize structure
                participants: [{ id: userId, name: initialUserName }],
                items: [],
                payments: [],
            };

            const splitsCollectionRef = getSplitsCollectionRef(db, appId);
            if (!splitsCollectionRef) throw new Error("Invalid collection reference.");

            await setDoc(doc(splitsCollectionRef), newSplitData);

            setNewSplitName('');
            setError(null);
            setMessage("New split created successfully!");
        } catch (e) {
            console.error("Error creating split:", e);
            setError("Failed to create new split. Check console for details.");
        } finally {
            setLoading(false);
        }
    };

    if (initError) {
        return <div className="p-8 text-center text-red-600 bg-red-100 rounded-xl m-4">Initialization Error: {initError}</div>;
    }

    if (!isAuthReady) {
        return <div className="flex items-center justify-center min-h-screen text-indigo-600"><Loader2 className="w-8 h-8 animate-spin mr-2" /> Initializing Firebase...</div>;
    }

    return (
        <div className="min-h-screen bg-gray-100 font-sans p-4 sm:p-8">
            {/* NOTE: In a real Next.js app, the script and style tags for Tailwind/Font are usually handled by global CSS or a configuration file. They are left here for sandbox compatibility. */}
            <script src="https://cdn.tailwindcss.com"></script>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
                body { font-family: 'Inter', sans-serif; }
            `}</style>
            
            <header className="text-center mb-8 max-w-xl mx-auto">
                <h1 className="text-4xl font-extrabold text-indigo-700">SnapSplit 💸</h1>
                <p className="text-gray-600 mt-2">Simplify sharing expenses with friends.</p>
                <div className="text-xs text-gray-400 mt-4 p-2 bg-white rounded-lg inline-block shadow-md border border-gray-200">
                    Your Public ID: <span className="font-mono text-indigo-500 break-all">{userId}</span>
                </div>
            </header>

            {/* New Split Form */}
            <Card className="mb-8 max-w-xl mx-auto">
                <h2 className="text-xl font-bold text-indigo-700 mb-4">Create New Split</h2>
                <div className="flex space-x-2">
                    <Input
                        placeholder="Name of the expense group (e.g., Weekend Trip)"
                        value={newSplitName}
                        onChange={(e) => setNewSplitName(e.target.value)}
                        className="flex-grow"
                    />
                    <Button
                        onClick={handleCreateSplit}
                        disabled={!newSplitName.trim() || loading}
                        icon={Plus}
                        className="w-1/3 min-w-[120px]"
                    >
                        Create
                    </Button>
                </div>
            </Card>

            {/* Messages and Errors */}
            {message && (
                <div className={`mb-4 p-3 ${message.includes('success') || message.includes('created') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} rounded-xl max-w-xl mx-auto transition-all`}>
                    {message}
                </div>
            )}
            {error && <div className="p-4 mb-4 text-red-600 bg-red-100 rounded-xl max-w-xl mx-auto">{error}</div>}

            {/* Splits List */}
            <div className="max-w-xl mx-auto">
                {loading && <div className="text-center text-indigo-500 mt-10 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin mr-2"/> Loading splits...</div>}

                {!loading && splits.length === 0 && (
                    <Card className="text-center text-gray-500">No splits found. Create one above!</Card>
                )}

                {!loading && splits.map(split => (
                    <SplitDetail
                        key={split.id}
                        split={split}
                        db={db}
                        appId={appId}
                        userId={userId}
                    />
                ))}
            </div>
        </div>
    );
};

export default SplitWisePage;
