import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Wallet, isAddress, parseEther, formatEther, JsonRpcProvider, Contract,
  formatUnits, parseUnits, Interface, BigNumber
} from "ethers";
import { Toaster, toast } from "react-hot-toast";
import clsx from "clsx";
import QRCode from "react-qr-code";
import "./App.css";

// --- CONFIGURATION ---
const RPC_URL = "https://bsc-testnet-dataseed.bnbchain.org";
const USDT_CONTRACT_ADDRESS = "0x787A697324dbA4AB965C58CD33c13ff5eeA6295F";
const USDC_CONTRACT_ADDRESS = "0x342e3aA1248AB77E319e3331C6fD3f1F2d4B36B1";
const API_URL = "https://wallet-backend-ri5i.onrender.com";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

// --- COMPONENTS ---
const Card = ({ title, children, className }) => (
  <section className={clsx("card", className)}>
    {title && <h3>{title}</h3>}
    {children}
  </section>
);

const QrModal = ({ address, onClose }) => (
  <div className="modal-backdrop" onClick={onClose}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <h4>Wallet Address</h4>
      <div className="qr-container">
        <QRCode value={address} size={256} />
      </div>
      <p>{address}</p>
      <button className="btn btn-secondary" onClick={onClose}>Close</button>
    </div>
  </div>
);

const ContactsModal = ({ contacts, onSelect, onClose }) => (
    <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h4>Select a Contact</h4>
            <ul className="contacts-modal-list">
                {contacts.length > 0 ? contacts.map(contact => (
                    <li key={contact._id} onClick={() => onSelect(contact.contactAddress)}>
                        <strong>{contact.contactName}</strong>
                        <span>{contact.contactAddress}</span>
                    </li>
                )) : <p>No contacts found. Add one in the Contacts tab.</p>}
            </ul>
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
    </div>
);

// NEW: Professional loading spinner component
const LoadingSpinner = () => <div className="spinner"></div>;


// --- MAIN APP ---
export default function App() {
  const [mode, setMode] = useState("fetch");
  const [walletName, setWalletName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [walletData, setWalletData] = useState(null);
  const [balance, setBalance] = useState(null);
  const [usdtBalance, setUsdtBalance] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [activeTab, setActiveTab] = useState("send");
  const [qrOpen, setQrOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sendToken, setSendToken] = useState("BNB");
  const [history, setHistory] = useState([]);
  const [pendingTxs, setPendingTxs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revealInput, setRevealInput] = useState("");
  const [showSensitive, setShowSensitive] = useState(false);
  
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [contacts, setContacts] = useState([]);
  const [newContactName, setNewContactName] = useState("");
  const [newContactAddress, setNewContactAddress] = useState("");
  const [isContactModalOpen, setContactModalOpen] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState(null);
  const [isFeeLoading, setFeeLoading] = useState(false);
  
  const provider = useMemo(() => new JsonRpcProvider(RPC_URL), []);

  const displayedHistory = useMemo(() => {
    const pendingWithStatus = pendingTxs.map(tx => ({ ...tx, status: 'Pending' }));
    const confirmedFiltered = history.filter(
      confirmedTx => !pendingTxs.some(pendingTx => pendingTx.hash === confirmedTx.hash)
    );
    return [...pendingWithStatus, ...confirmedFiltered].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [pendingTxs, history]);

  const fetchAllBalances = useCallback(async (address) => {
    try {
      const bnbBal = await provider.getBalance(address);
      setBalance(formatEther(bnbBal));
      const usdt = new Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, provider);
      setUsdtBalance(formatUnits(await usdt.balanceOf(address), await usdt.decimals()));
      const usdc = new Contract(USDC_CONTRACT_ADDRESS, ERC20_ABI, provider);
      setUsdcBalance(formatUnits(await usdc.balanceOf(address), await usdc.decimals()));
    } catch (e) {
      toast.error("Failed to fetch balances.");
    }
  }, [provider]);

  const handleSubmit = async () => {
    if (!walletName.trim() || !password.trim()) return toast.error("Fill all fields");
    if (mode === "create" && password !== confirmPw) return toast.error("Passwords don’t match");
    setLoading(true);
    try {
      if (mode === "create") {
        const wallet = Wallet.createRandom();
        const payload = { name: walletName, address: wallet.address, privateKey: wallet.privateKey, mnemonic: wallet.mnemonic.phrase, password };
        const res = await fetch(`${API_URL}/api/wallet`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (res.ok) {
          toast.success("Wallet created & saved!");
          setWalletName(""); setPassword(""); setConfirmPw("");
        } else {
          const errorData = await res.json();
          toast.error(errorData.error || "Save failed");
        }
      } else {
        const res = await fetch(`${API_URL}/api/wallet/${walletName}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
        const data = await res.json();
        if (data.error) {
          toast.error(data.error);
        } else {
          toast.success(`Wallet "${data.name}" loaded!`);
          setWalletData(data);
          fetchAllBalances(data.address);
        }
      }
    } catch (e) {
      toast.error("A network error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!walletName.trim() || !mnemonicInput.trim() || !password.trim()) return toast.error("Please fill all fields.");
    if (password !== confirmPw) return toast.error("New passwords do not match.");
    setLoading(true);
    try {
      const payload = { name: walletName, mnemonic: mnemonicInput, newPassword: password };
      const res = await fetch(`${API_URL}/api/wallet/reset-password`, { method: 'PUT', headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setMode("fetch");
        setWalletName("");
        setMnemonicInput("");
        setPassword("");
        setConfirmPw("");
      } else {
        toast.error(data.error || "Failed to reset password.");
      }
    } catch (e) {
      toast.error("A network error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!walletData) return toast.error("Load wallet first.");
    if (!isAddress(recipient)) return toast.error("Invalid recipient address.");
    if (!amount || parseFloat(amount) <= 0) return toast.error("Invalid amount.");

    setLoading(true);
    const toastId = toast.loading(`Submitting transaction...`);
    // Omitted the rest of the function for brevity, it stays the same
  };

  // Other functions like logTransaction, handleCancel, fetchHistory etc. remain unchanged...

  if (!walletData) {
    const getTitle = () => {
      if (mode === 'create') return "Create a New Wallet";
      if (mode === 'reset') return "Reset Your Password";
      return "Access Your Wallet";
    };

    const getButtonText = () => {
      if (mode === 'create') return "Create & Secure Wallet";
      if (mode === 'reset') return "Reset Password";
      return "Access My Wallet";
    };

    const mainAction = mode === 'reset' ? handlePasswordReset : handleSubmit;

    return (
        <div className="app-pre-login">
            <Toaster position="top-center" toastOptions={{ className: 'toast-custom' }}/>
            <div className="login-box">
                <h1 className="title">🦊 CryptoNest</h1>
                <p className="subtitle">{getTitle()}</p>
                
                {mode !== 'reset' && (
                  <div className="pill-toggle">
                      <span className={clsx({ active: mode === "create" })} onClick={() => setMode("create")}>Create Wallet</span>
                      <span className={clsx({ active: mode === "fetch" })} onClick={() => setMode("fetch")}>Access Wallet</span>
                  </div>
                )}

                <div className="input-group">
                    <input placeholder="Wallet Name" value={walletName} onChange={(e) => setWalletName(e.target.value)} />
                    {mode === 'reset' && <textarea className="mnemonic-input" placeholder="Enter your 12-word Mnemonic Phrase..." value={mnemonicInput} onChange={(e) => setMnemonicInput(e.target.value)} rows={3}/>}
                    <input type="password" placeholder={mode === 'reset' ? 'Enter New Password' : 'Password'} value={password} onChange={(e) => setPassword(e.target.value)}/>
                    {(mode === "create" || mode === 'reset') && <input type="password" placeholder={mode === 'reset' ? 'Confirm New Password' : 'Confirm Password'} value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}/>}
                </div>

                {/* UPDATED: Button now shows spinner when loading */}
                <button className="btn btn-primary" onClick={mainAction} disabled={loading}>
                    {loading ? <LoadingSpinner /> : getButtonText()}
                </button>

                <div className="login-footer-links">
                  {mode === 'fetch' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('reset'); }}>Forgot Password?</a>}
                  {mode === 'reset' && <a href="#" onClick={(e) => { e.preventDefault(); setMode('fetch'); }}>Back to Login</a>}
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="app-logged-in">
        <Toaster position="top-center" toastOptions={{ className: 'toast-custom' }}/>
        {qrOpen && <QrModal address={walletData.address} onClose={() => setQrOpen(false)} />}
        {isContactModalOpen && <ContactsModal contacts={contacts} onClose={() => setContactModalOpen(false)} onSelect={(address) => { setRecipient(address); setContactModalOpen(false); }} />}
        
        <header className="app-header">
            <h1 className="title-small">🦊 CryptoNest</h1>
            <button className="btn btn-secondary" onClick={() => { setWalletData(null); setPassword('')}}>Lock Wallet</button>
        </header>
        
        <main className="app-main">
            <div className="wallet-sidebar">
                <Card title={`Wallet: ${walletData.name}`}>
                    <div className="address-bar">
                        <span>{`${walletData.address.slice(0, 6)}...${walletData.address.slice(-4)}`}</span>
                        <button onClick={() => setQrOpen(true)} title="Show QR Code">📷</button>
                        <button onClick={() => navigator.clipboard.writeText(walletData.address).then(() => toast.success('Address copied!'))} title="Copy Address">📋</button>
                    </div>
                </Card>
                <Card title="Balances">
                    <p className="balance-row"><strong>BNB:</strong> <span>{balance ? parseFloat(balance).toFixed(5) : "…"}</span></p>
                    <p className="balance-row"><strong>USDT:</strong> <span>{usdtBalance ? parseFloat(usdtBalance).toFixed(2) : "…"}</span></p>
                    <p className="balance-row"><strong>USDC:</strong> <span>{usdcBalance ? parseFloat(usdcBalance).toFixed(2) : "…"}</span></p>
                    <button className="btn btn-secondary" style={{width: '100%', marginTop: '10px'}} onClick={() => fetchAllBalances(walletData.address)}>Refresh</button>
                </Card>
            </div>
            
            <div className="wallet-main">
                <div className="main-tabs">
                    <button className={clsx('tab-btn', {active: activeTab === 'send'})} onClick={() => setActiveTab('send')}>🚀 Send</button>
                    <button className={clsx('tab-btn', {active: activeTab === 'history'})} onClick={() => setActiveTab('history')}>📜 History</button>
                    <button className={clsx('tab-btn', {active: activeTab === 'contacts'})} onClick={() => setActiveTab('contacts')}>👥 Contacts</button>
                    <button className={clsx('tab-btn', {active: activeTab === 'security'})} onClick={() => setActiveTab('security')}>🔐 Security</button>
                </div>
                <div className="tab-content">
                    {activeTab === 'send' && (
                        <Card>
                            {/* Form remains the same */}
                            {/* UPDATED: Send button now uses the spinner */}
                            <button className="btn btn-primary" onClick={handleSend} disabled={loading}>
                                {loading ? <LoadingSpinner /> : `Send ${sendToken}`}
                            </button>
                            <div className="fee-display">
                                <span>Estimated Fee:</span>
                                <span>{isFeeLoading ? "Calculating..." : estimatedFee ? `~${parseFloat(estimatedFee).toFixed(6)} BNB` : "N/A"}</span>
                            </div>
                        </Card>
                    )}

                    {activeTab === 'history' && (
                       <Card>
                         {/* UPDATED: History now uses the spinner */}
                         {(historyLoading && displayedHistory.length === 0) ? <LoadingSpinner /> : (
                           <ul className="history-list">
                            {/* ... mapping logic ... */}
                           </ul>
                         )}
                       </Card>
                    )}

                    {/* Contacts and Security tabs remain functionally the same */}
                    {activeTab === 'security' && (
                        <Card title="Reveal Private key & Mnemonic">
                            {/* ... content ... */}
                            <button
                              className="btn btn-danger"
                              onClick={() => {
                                if (showSensitive) { setShowSensitive(false); }
                                else { if (revealInput === password) { setShowSensitive(true); } else if (revealInput) { toast.error("Incorrect password!"); } }
                                setRevealInput("");
                              }}
                            >
                                {showSensitive ? "Hide Secrets" : "Reveal Secrets"}
                            </button>
                            {/* ... content ... */}
                        </Card>
                    )}
                </div>
            </div>
        </main>
    </div>
  );
}