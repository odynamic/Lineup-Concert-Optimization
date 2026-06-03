import React, { useState } from 'react';
import axios from 'axios';
import { 
  LayoutDashboard, Database, Sliders, BarChart3, 
  Zap, Trophy, Users, Calendar, AlertTriangle, 
  FileSpreadsheet, Play, Trash2, Download, Edit2, Check, X, FileText
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Data State
  const [dataset, setDataset] = useState(null); 
  const [optResults, setOptResults] = useState(null); 
  const [loadingDataset, setLoadingDataset] = useState(false);
  const [loadingGA, setLoadingGA] = useState(false);

  const [previewDayFilter, setPreviewDayFilter] = useState('Semua Hari');
  const [resultDayFilter, setResultDayFilter] = useState('Day 1');

  const [editingIndex, setEditingIndex] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  const [popSize, setPopSize] = useState(100);
  const [maxGen, setMaxGen] = useState(300);
  const [crossoverRate, setCrossoverRate] = useState(80);
  const [mutationRate, setMutationRate] = useState(10);
  const [wEnergy, setWEnergy] = useState(1.0);
  const [wPopularity, setWPopularity] = useState(10.0);
  const [wHeadliner, setWHeadliner] = useState(1.5);

  // ==========================================
  // HANDLER DATASET & MANIPULASI DATA
  // ==========================================

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoadingDataset(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws);

        const formattedData = rawData.map((item) => ({
          Artist_name: item.Artist_name || item['Nama Artis'] || 'Unknown Artist',
          Day: parseInt(item.Day || item.Hari || 1),
          Genre: item.Genre || item.Aliran || 'Pop',
          Popularity_score: parseFloat(item.Popularity_score || item.Popularitas || 0.5),
          Energy: parseInt(item.Energy || item.Energi || 5),
          Tempo: parseFloat(item.Tempo || 120),
          Is_headliner: parseInt(item.Is_headliner || 0)
        }));

        updateDatasetStats(formattedData);
        setOptResults(null);
      } catch (err) {
        alert("Gagal memproses file! Pastikan format kolom sesuai template.");
      } finally {
        setLoadingDataset(false);
      }
    };
    reader.readAsBinaryString(file);
  };

const handleLoadDemoDataset = async () => {
    setLoadingDataset(true);
    try {
      const response = await axios.get('/lineup-prambanan-jazz.csv');
      
      const lines = response.data.replace(/\r/g, '').split('\n').filter(line => line.trim() !== '');
      
      const parsedData = lines.slice(1).map(line => {
        const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
        const cleanValues = values.map(v => v.replace(/^"|"$/g, '').trim());
        
        return {
          Artist_name: cleanValues[0] || 'Unknown Artist',
          Day: parseInt(cleanValues[1]) || 1,
          Genre: cleanValues[2] || 'Jazz',
          Popularity_score: parseFloat(cleanValues[3]) || 0.0,
          Energy: parseInt(cleanValues[5]) || 5,
          Tempo: parseFloat(cleanValues[6]) || 110,
          Is_headliner: parseInt(cleanValues[7]) || 0
        };
      });

      updateDatasetStats(parsedData);
      setOptResults(null);
    } catch (error) {
      console.error(error);
      alert("Gagal memuat data contoh. Pastikan file '/lineup-prambanan-jazz.csv' ada di folder public.");
    } finally {
      setLoadingDataset(false);
    }
  };
  const updateDatasetStats = (dataList) => {
    const total_artists = dataList.length;
    const total_days = new Set(dataList.map(item => item.Day)).size;
    const total_headliners = dataList.filter(item => item.Is_headliner === 1).length;
    const avg_energy = dataList.reduce((acc, curr) => acc + curr.Energy, 0) / (total_artists || 1);

    setDataset({
      summary: {
        total_artists,
        total_days,
        total_headliners,
        avg_energy: roundTo(avg_energy, 1)
      },
      data: dataList
    });
  };

  const handleClearDataset = () => {
    setDataset(null);
    setOptResults(null);
    setActiveTab('dashboard');
  };

  const startEditing = (index, rowData) => {
    setEditingIndex(index);
    setEditFormData({ ...rowData });
  };

  const saveRowEdit = (index) => {
    const updatedData = [...dataset.data];
    updatedData[index] = {
      ...editFormData,
      Day: parseInt(editFormData.Day),
      Energy: parseInt(editFormData.Energy),
      Popularity_score: parseFloat(editFormData.Popularity_score)
    };
    updateDatasetStats(updatedData);
    setEditingIndex(null);
  };

  const deleteRow = (index) => {
    const updatedData = dataset.data.filter((_, i) => i !== index);
    updateDatasetStats(updatedData);
  };

  const downloadUpdatedExcel = () => {
    if (!dataset) return;
    const ws = XLSX.utils.json_to_sheet(dataset.data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dataset Terupdate");
    XLSX.writeFile(wb, "Dataset_Festival_Terupdate.xlsx");
  };

  // ==========================================
  // CORE ENGINE PIPELINE (ALGORITMA GENETIKA)
  // ==========================================

// Kirim data ke FastAPI Backend
  const handleRunGA = async () => {
    if (!dataset || !dataset.data || dataset.data.length === 0) {
      alert("Dataset kosong! Silakan unggah file atau muat contoh data terlebih dahulu.");
      return;
    }

    setLoadingGA(true);
    try {
      await axios.post('http://localhost:8000/api/upload-dataset', dataset.data);

      const response = await axios.post('http://localhost:8000/api/optimize', {
        population_size: parseInt(popSize),
        max_generations: parseInt(maxGen),
        crossover_rate: parseFloat(crossoverRate) / 100,
        mutation_rate: parseFloat(mutationRate) / 100,
        weight_energy: parseFloat(wEnergy),
        weight_popularity: parseFloat(wPopularity),
        weight_headliner: parseFloat(wHeadliner)
      });
      
      setOptResults(response.data);
      setActiveTab('hasil');
    } catch (error) {
      console.error("Detail Error:", error);
      const errorMsg = error.response?.data?.detail || "Gagal memproses perhitungan optimasi ke server!";
      alert(errorMsg);
    } finally { 
      setLoadingGA(false);
    }
  };

  // Mengunduh hasil Rundown urutan tampil menjadi PDF
  const downloadRundownPDF = () => {
    try {
      if (!optResults || !optResults[resultDayFilter]) {
        alert(`Data untuk ${resultDayFilter} belum tersedia. Silakan jalankan optimasi terlebih dahulu.`);
        return;
      }

      const currentLineup = optResults[resultDayFilter].lineup;
      if (!currentLineup || currentLineup.length === 0) {
        alert(`Susunan acara untuk ${resultDayFilter} kosong.`);
        return;
      }

      const doc = new jsPDF();

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.text(`RUNDOWN PELAKSANAAN KONSER - ${resultDayFilter.toUpperCase()}`, 14, 16);
      
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`Dihasilkan otomatis menggunakan Sistem Optimasi Algoritma Genetika`, 14, 22);

      const tableBody = currentLineup.map((row) => [
        row.slot,
        row.artist.toUpperCase(),
        row.genre,
        row.role
      ]);

      autoTable(doc, {
        startY: 28,
        head: [['URUTAN TAMPIL', 'NAMA ARTIS / BAND', 'GENRE', 'KETERANGAN']],
        body: tableBody,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] },
        styles: { font: "Helvetica", fontSize: 9 },
      });

      doc.save(`Rundown_Optimasi_${resultDayFilter}.pdf`);

    } catch (error) {
      console.error("Gagal mencetak PDF:", error);
      alert("Terjadi kesalahan saat membuat file PDF: " + error.message);
    }
  };

  const roundTo = (num, decimals) => {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  };

  return (
    <div className="flex min-h-screen bg-[#0B0F19] text-gray-100 font-sans selection:bg-[#10B981]/30">
      
      {/* SIDEBAR NAVIGASI */}
      <aside className="w-64 bg-[#111827] border-r border-gray-800 p-6 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="p-2 bg-[#10B981] rounded-xl text-black flex items-center justify-center">
              <Zap size={20} fill="black" />
            </div>
            <div>
              <h2 className="font-bold text-sm tracking-tight text-white">Optimasi Lineup</h2>
              <span className="text-[11px] text-gray-400 block -mt-0.5">Konser Musik</span>
            </div>
          </div>

          <nav className="space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
              { id: 'dataset', label: 'Dataset Festival', icon: <Database size={18} /> },
              { id: 'optimasi', label: 'Parameter GA', icon: <Sliders size={18} /> },
              { id: 'hasil', label: 'Hasil Rundown', icon: <BarChart3 size={18} /> },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === item.id 
                    ? 'bg-[#1F2937] text-[#10B981] border-l-4 border-[#10B981]' 
                    : 'text-gray-400 hover:bg-[#1F2937]/50 hover:text-gray-200'
                }`}
              >
                {item.icon} {item.label}
              </button>
            ))}
          </nav>
        </div>
        <div className="bg-[#1F2937]/40 p-4 rounded-xl text-[11px] text-gray-400 border border-gray-800/60">
          <p className="font-bold text-gray-300 mb-1">Status Alur Kerja</p>
          Langkah: Unggah file data festival di menu Dataset, lalu jalankan mesin hitung.
        </div>
      </aside>

      {/* MAIN CONTENT SPACE */}
      <main className="flex-1 p-8 overflow-y-auto">
        
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Dashboard Utama</h1>
              <p className="text-gray-400 text-xs mt-0.5">Ringkasan status data panggung festival musik.</p>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div className="bg-[#111827] border border-gray-800/80 p-5 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold tracking-wider uppercase">TOTAL ARTIS</p>
                  <p className="text-2xl font-black mt-1 text-white">{dataset ? dataset.summary.total_artists : 0}</p>
                </div>
                <div className="p-2.5 bg-gray-800/60 text-gray-400 rounded-lg"><Users size={18} /></div>
              </div>
              <div className="bg-[#111827] border border-gray-800/80 p-5 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold tracking-wider uppercase">JUMLAH HARI</p>
                  <p className="text-2xl font-black text-[#10B981] mt-1">{dataset ? dataset.summary.total_days : 0}</p>
                </div>
                <div className="p-2.5 bg-gray-800/60 text-[#10B981] rounded-lg"><Calendar size={18} /></div>
              </div>
              <div className="bg-[#111827] border border-gray-800/80 p-5 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold tracking-wider uppercase">HEADLINER UTAMA</p>
                  <p className="text-2xl font-black text-purple-400 mt-1">{dataset ? dataset.summary.total_headliners : 0}</p>
                </div>
                <div className="p-2.5 bg-gray-800/60 text-purple-400 rounded-lg"><Trophy size={18} /></div>
              </div>
              <div className="bg-[#111827] border border-gray-800/80 p-5 rounded-xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold tracking-wider uppercase">RATA-RATA ENERGI</p>
                  <p className="text-2xl font-black text-white mt-1">{dataset ? dataset.summary.avg_energy : '0'}</p>
                </div>
                <div className="p-2.5 bg-gray-800/60 text-gray-400 rounded-lg"><Zap size={18} /></div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-5">
              <div className="col-span-2 bg-[#111827] border border-gray-800/80 rounded-xl p-8 text-center flex flex-col items-center justify-center min-h-[280px]">
                <div className="p-3 bg-gray-800/60 text-[#10B981] rounded-full mb-3">
                  <FileSpreadsheet size={24} />
                </div>
                <h3 className="text-sm font-bold text-white">Mulai Susun Strategi Lineup Konser</h3>
                <p className="text-gray-400 text-xs max-w-sm mt-1 mb-5 leading-relaxed">
                  Sistem ini menggunakan Algoritma Genetika untuk mengurutkan jam tampil demi kestabilan alur energi panggung dan menaruh artis terpopuler di jam malam puncak.
                </p>
                <button 
                  onClick={() => setActiveTab('dataset')}
                  className="px-6 py-2.5 bg-[#10B981] text-black font-extrabold rounded-lg text-xs hover:opacity-95 shadow-lg shadow-emerald-500/10 transition-all uppercase tracking-wider"
                >
                  Mulai Kelola Festival
                </button>
              </div>

              <div className="bg-[#111827] border border-gray-800 rounded-xl p-5 flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-xs text-white">Status Berkas</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">{dataset ? 'Dataset aktif & siap dihitung' : 'Belum ada data festival'}</p>
                </div>
                <div className="text-center py-4 flex flex-col items-center">
                  <Database size={28} className={dataset ? "text-[#10B981]" : "text-gray-600"} />
                  <p className="text-[11px] text-gray-500 mt-2">
                    {dataset ? `${dataset.summary.total_artists} baris data termuat.` : "Sistem menerima data konser umum via Excel / CSV."}
                  </p>
                </div>
                {dataset && (
                  <button onClick={handleClearDataset} className="w-full py-2 bg-red-950/20 hover:bg-red-900/40 border border-red-900/60 text-red-300 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all">
                    <Trash2 size={13} /> Bersihkan Memori
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* DATASET TAB */}
        {activeTab === 'dataset' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white">Dataset Management</h1>
                <p className="text-gray-400 text-xs mt-0.5">Unggah berkas, lakukan perubahan data, dan unduh hasil revisi Excel.</p>
              </div>
              <div className="flex gap-2">
                <a 
                  href="/lineup-prambanan-jazz.csv" 
                  download="Template_Format_Lineup.csv"
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-bold rounded-lg text-gray-300 flex items-center gap-1.5 transition-all"
                >
                  <Download size={14} /> Ambil Template Kolom
                </a>
                <button 
                  onClick={handleLoadDemoDataset}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-bold rounded-lg text-purple-300 transition-all"
                >
                  Muat Contoh Prambanan
                </button>
                <label className="px-3 py-1.5 bg-[#10B981] text-black font-bold rounded-lg text-xs hover:opacity-90 cursor-pointer flex items-center gap-1">
                  <FileSpreadsheet size={14} /> Unggah File Anda (.xlsx / .csv)
                  <input type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>

            {!dataset ? (
              <div className="border border-dashed border-gray-800 rounded-xl p-20 text-center flex flex-col items-center justify-center bg-[#111827]/30">
                <FileSpreadsheet size={40} className="text-gray-600 mb-3" />
                <h3 className="font-bold text-sm text-white">Belum Ada Data Festival yang Masuk</h3>
                <p className="text-gray-400 text-xs max-w-xs mt-1">Silakan gunakan tombol Unggah File untuk festival musik Anda, atau klik Muat Contoh Prambanan untuk simulasi testing.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden shadow-xl">
                  <div className="p-4 border-b border-gray-800/80 flex justify-between items-center bg-gray-900/30">
                    <div>
                      <h3 className="font-bold text-xs text-white">Manajemen & Modifikasi Data Tabel</h3>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Menampilkan: {previewDayFilter === 'Semua Hari' ? 'Semua Hari' : previewDayFilter}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={downloadUpdatedExcel}
                        className="px-3 py-1.5 bg-emerald-950/50 border border-emerald-800 text-emerald-300 font-semibold rounded-lg text-xs hover:bg-emerald-900/40 transition-all"
                      >
                        Unduh Excel Hasil Edit Terbaru
                      </button>
                      <select 
                        value={previewDayFilter} 
                        onChange={(e) => setPreviewDayFilter(e.target.value)}
                        className="bg-gray-800 border border-gray-700 text-xs px-3 py-1.5 rounded-lg text-white font-medium focus:outline-none focus:border-[#10B981]"
                      >
                        <option value="Semua Hari">Semua Hari</option>
                        <option value="Day 1">Day 1</option>
                        <option value="Day 2">Day 2</option>
                        <option value="Day 3">Day 3</option>
                      </select>
                    </div>
                  </div>
                  
                  <div className="overflow-x-auto max-h-[450px]">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-gray-900/60 sticky top-0 border-b border-gray-800 text-gray-400 uppercase tracking-wider text-[10px] font-bold">
                        <tr>
                          <th className="p-3 w-10">#</th>
                          <th className="p-3">Nama Artis</th>
                          <th className="p-3 w-24">Day</th>
                          <th className="p-3">Genre</th>
                          <th className="p-3 w-28">Popularity (0-1)</th>
                          <th className="p-3 w-24">Energy (1-10)</th>
                          <th className="p-3 w-24">Headliner</th>
                          <th className="p-3 w-24 text-center">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/40 text-gray-300">
                        {dataset.data
                          .map((row, idx) => ({ originalIndex: idx, rowData: row }))
                          .filter(item => previewDayFilter === 'Semua Hari' || `Day ${item.rowData.Day}` === previewDayFilter)
                          .map((item, viewIdx) => {
                            const isEditing = editingIndex === item.originalIndex;
                            return (
                              <tr key={item.originalIndex} className="hover:bg-gray-800/20 transition-colors">
                                <td className="p-3 text-gray-500 font-mono">{viewIdx + 1}</td>
                                <td className="p-3 font-semibold text-white">
                                  {isEditing ? (
                                    <input type="text" className="bg-gray-800 border border-gray-700 p-1 rounded text-white text-xs w-full font-normal" value={editFormData.Artist_name} onChange={(e) => setEditFormData({ ...editFormData, Artist_name: e.target.value })} />
                                  ) : item.rowData.Artist_name}
                                </td>
                                <td className="p-3">
                                  {isEditing ? (
                                    <input type="number" className="bg-gray-800 border border-gray-700 p-1 rounded text-white text-xs w-16 font-mono" value={editFormData.Day} onChange={(e) => setEditFormData({ ...editFormData, Day: e.target.value })} />
                                  ) : (
                                    <span className="bg-gray-800 text-[10px] font-bold px-2 py-0.5 rounded text-gray-300">Day {item.rowData.Day}</span>
                                  )}
                                </td>
                                <td className="p-3 text-gray-400">
                                  {isEditing ? (
                                    <input type="text" className="bg-gray-800 border border-gray-700 p-1 rounded text-white text-xs w-full" value={editFormData.Genre} onChange={(e) => setEditFormData({ ...editFormData, Genre: e.target.value })} />
                                  ) : item.rowData.Genre}
                                </td>
                                <td className="p-3 font-mono">
                                  {isEditing ? (
                                    <input type="number" step="0.01" className="bg-gray-800 border border-gray-700 p-1 rounded text-white text-xs w-20" value={editFormData.Popularity_score} onChange={(e) => setEditFormData({ ...editFormData, Popularity_score: e.target.value })} />
                                  ) : item.rowData.Popularity_score.toFixed(3)}
                                </td>
                                <td className="p-3 font-mono">
                                  {isEditing ? (
                                    <input type="number" className="bg-gray-800 border border-gray-700 p-1 rounded text-white text-xs w-16" value={editFormData.Energy} onChange={(e) => setEditFormData({ ...editFormData, Energy: e.target.value })} />
                                  ) : item.rowData.Energy}
                                </td>
                                <td className="p-3">
                                  {isEditing ? (
                                    <select className="bg-gray-800 border border-gray-700 p-1 rounded text-white text-xs" value={editFormData.Is_headliner} onChange={(e) => setEditFormData({ ...editFormData, Is_headliner: parseInt(e.target.value) })}>
                                      <option value={0}>Bukan</option>
                                      <option value={1}>Headliner</option>
                                    </select>
                                  ) : (
                                    item.rowData.Is_headliner === 1 ? (
                                      <span className="bg-purple-950/60 text-purple-300 border border-purple-800/60 px-2 py-0.5 rounded text-[9px] font-black uppercase">Headliner</span>
                                    ) : '—'
                                  )}
                                </td>
                                <td className="p-3 text-center">
                                  {isEditing ? (
                                    <div className="flex justify-center gap-1.5">
                                      <button onClick={() => saveRowEdit(item.originalIndex)} className="p-1 bg-emerald-900 text-emerald-200 rounded hover:bg-emerald-800"><Check size={14} /></button>
                                      <button onClick={() => setEditingIndex(null)} className="p-1 bg-gray-700 text-gray-300 rounded hover:bg-gray-600"><X size={14} /></button>
                                    </div>
                                  ) : (
                                    <div className="flex justify-center gap-1.5">
                                      <button onClick={() => startEditing(item.originalIndex, item.rowData)} className="p-1 text-gray-400 hover:text-[#10B981] hover:bg-gray-800 rounded"><Edit2 size={13} /></button>
                                      <button onClick={() => deleteRow(item.originalIndex)} className="p-1 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded"><Trash2 size={13} /></button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PARAMETER OPTIMASI TAB */}
        {activeTab === 'optimasi' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white">Parameter Evolusi GA</h1>
              <p className="text-gray-400 text-xs mt-0.5">Konfigurasi nilai bobot kecocokan serta batasan iterasi kromosom.</p>
            </div>

            {!dataset && (
              <div className="bg-amber-950/30 border border-amber-800 p-4 rounded-xl flex items-start gap-3 text-amber-200 text-xs shadow-lg">
                <AlertTriangle className="shrink-0 mt-0.5 text-amber-400" size={16} />
                <div>
                  <p className="font-bold">Dataset Kosong</p>
                  <p className="text-amber-300/80 mt-0.5">Harap isi data musisi di menu Dataset terlebih dahulu agar parameter ini bisa dikalkulasi.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 bg-[#111827] border border-gray-800 p-6 rounded-xl space-y-5 shadow-xl">
                <div className="pb-2 border-b border-gray-800">
                  <h3 className="font-bold text-xs flex items-center gap-2 text-[#10B981]">
                    <Sliders size={16} /> Parameter Kontrol Algoritma
                  </h3>
                </div>
                
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-300 font-medium">Ukuran Populasi (Kromosom per Generasi)</span>
                    <span className="text-[#10B981] font-black font-mono">{popSize}</span>
                  </div>
                  <input type="range" min="20" max="300" value={popSize} onChange={(e)=>setPopSize(e.target.value)} disabled={!dataset} className="w-full accent-[#10B981] bg-gray-800 h-1 rounded cursor-pointer disabled:opacity-30" />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-300 font-medium">Maksimum Iterasi Generasi</span>
                    <span className="text-[#10B981] font-black font-mono">{maxGen}</span>
                  </div>
                  <input type="range" min="50" max="1000" value={maxGen} onChange={(e)=>setMaxGen(e.target.value)} disabled={!dataset} className="w-full accent-[#10B981] bg-gray-800 h-1 rounded cursor-pointer disabled:opacity-30" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-300">Crossover Rate</span>
                      <span className="text-[#10B981] font-mono font-bold">{crossoverRate}%</span>
                    </div>
                    <input type="range" min="10" max="100" value={crossoverRate} onChange={(e)=>setCrossoverRate(e.target.value)} disabled={!dataset} className="w-full accent-[#10B981] bg-gray-800 h-1" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-300">Mutation Rate</span>
                      <span className="text-[#10B981] font-mono font-bold">{mutationRate}%</span>
                    </div>
                    <input type="range" min="1" max="50" value={mutationRate} onChange={(e)=>setMutationRate(e.target.value)} disabled={!dataset} className="w-full accent-[#10B981] bg-gray-800 h-1" />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-800/80 grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <label className="text-gray-400 font-semibold block mb-1">w1 · Aliran Energi</label>
                    <input type="number" step="0.1" value={wEnergy} onChange={(e)=>setWEnergy(e.target.value)} disabled={!dataset} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-[#10B981]" />
                  </div>
                  <div>
                    <label className="text-gray-400 font-semibold block mb-1">w2 · Popularitas Malam</label>
                    <input type="number" step="0.1" value={wPopularity} onChange={(e)=>setWPopularity(e.target.value)} disabled={!dataset} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-[#10B981]" />
                  </div>
                  <div>
                    <label className="text-gray-400 font-semibold block mb-1">w3 · Kunci Headliner</label>
                    <input type="number" step="0.1" value={wHeadliner} onChange={(e)=>setWHeadliner(e.target.value)} disabled={!dataset} className="w-full bg-gray-800 border border-gray-700 p-2 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-[#10B981]" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-[#111827] border border-gray-800 p-5 rounded-xl flex flex-col justify-between min-h-[180px] shadow-xl">
                  <div>
                    <h4 className="font-bold text-xs text-white mb-1">Eksekusi Perhitungan</h4>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      Sistem akan memproses penyusunan jadwal manggung secara otomatis.
                    </p>
                  </div>
                  
                  <button 
                    onClick={handleRunGA}
                    disabled={loadingGA || !dataset}
                    className={`w-full py-3 font-extrabold rounded-lg text-black flex items-center justify-center gap-2 text-xs uppercase tracking-wider transition-all ${
                      loadingGA 
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed animate-pulse' 
                        : 'bg-gradient-to-r from-[#10B981] to-emerald-600 hover:opacity-95 shadow-md'
                    }`}
                  >
                    {loadingGA ? (
                      <>
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                        Memproses Algoritma Genetika...
                      </>
                    ) : (
                      <>
                        <Play size={13} fill="black" /> Jalankan Optimasi
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HASIL RUNDOWN TAB */}
        {activeTab === 'hasil' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-white">Rundown Rekomendasi</h1>
                <p className="text-gray-400 text-xs mt-0.5">Urutan jadwal panggung hasil optimasi berdasarkan kecocokan parameter kriteria.</p>
              </div>
              {optResults && (
                <button 
                  onClick={downloadRundownPDF}
                  className="px-4 py-2 bg-purple-900/40 border border-purple-800 text-purple-300 font-bold rounded-lg text-xs hover:bg-purple-900/60 flex items-center gap-1.5 transition-all"
                >
                  <FileText size={14} /> Unduh Rundown (PDF)
                </button>
              )}
            </div>

            {optResults ? (
              <div className="space-y-6">
                <div className="flex gap-2 border-b border-gray-800 pb-px">
                  {Object.keys(optResults).map((dayKey) => (
                    <button
                      key={dayKey}
                      onClick={() => setResultDayFilter(dayKey)}
                      className={`px-4 py-2 text-xs font-bold transition-all -mb-px border-b-2 ${
                        resultDayFilter === dayKey 
                          ? 'border-[#10B981] text-[#10B981]' 
                          : 'border-transparent text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {dayKey}
                    </button>
                  ))}
                </div>

                {optResults[resultDayFilter] && (
                  <>
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div className="bg-[#111827] p-4 rounded-xl border border-gray-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-gray-400 font-bold block tracking-wider">FITNESS SCORE TERBAIK</span>
                          <span className="text-lg font-black text-[#10B981] mt-0.5 block font-mono">{optResults[resultDayFilter].summary.best_fitness}</span>
                        </div>
                        <Trophy className="text-[#10B981]" size={18} />
                      </div>
                      <div className="bg-[#111827] p-4 rounded-xl border border-gray-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-gray-400 font-bold block tracking-wider">JUMLAH SLOT ACARA</span>
                          <span className="text-lg font-black text-white mt-0.5 block">{optResults[resultDayFilter].summary.total_artists} Musisi</span>
                        </div>
                        <Users className="text-purple-400" size={18} />
                      </div>
                      <div className="bg-[#111827] p-4 rounded-xl border border-gray-800 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-gray-400 font-bold block tracking-wider">ARTIS PENUTUP (HEADLINER)</span>
                          <span className="text-xs font-black text-purple-300 mt-1 block truncate w-40 uppercase">{optResults[resultDayFilter].summary.headliner}</span>
                        </div>
                        <Zap className="text-amber-400" size={18} fill="currentColor" />
                      </div>
                    </div>

                    <div className="bg-[#111827] border border-gray-800 rounded-xl overflow-hidden shadow-xl">
                      <div className="p-4 bg-gray-900/30 border-b border-gray-800/80 flex justify-between items-center">
                        <h3 className="font-bold text-xs text-white">Rundown Pelaksanaan Musik ({resultDayFilter})</h3>
                      </div>
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-gray-900/50 text-gray-400 border-b border-gray-800 text-[10px] font-bold uppercase tracking-wider">
                          <tr>
                            <th className="p-3 w-20 text-center">Urutan</th>
                            <th className="p-3">Nama Artis / Band</th>
                            <th className="p-3">Genre</th>
                            <th className="p-3">Popularity Score</th>
                            <th className="p-3">Energy</th>
                            <th className="p-3">Peran Panggung</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/40 text-gray-300">
                          {optResults[resultDayFilter].lineup.map((row) => (
                            <tr key={row.slot} className="hover:bg-gray-800/20 transition-colors">
                              <td className="p-3 text-center font-mono font-bold text-[#10B981]">{row.slot}</td>
                              <td className="p-3 font-semibold text-white uppercase">{row.artist}</td>
                              <td className="p-3 text-gray-400">{row.genre}</td>
                              <td className="p-3 font-mono text-gray-400">{row.popularity.toFixed(3)}</td>
                              <td className="p-3 font-mono">{row.energy}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                                  row.role === 'Penutup' ? 'bg-purple-950/50 text-purple-300 border border-purple-800/60' : row.role === 'Pembuka' ? 'bg-blue-950/50 text-blue-300 border border-blue-800/60' : 'bg-gray-800/60 text-gray-400'
                                }`}>
                                  {row.role}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                      <div className="bg-[#111827] p-4 rounded-xl border border-gray-800">
                        <h3 className="text-[11px] font-bold text-gray-300 mb-3">Grafik Aliran Energi Panggung</h3>
                        <div className="h-40 text-[9px] font-mono">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={optResults[resultDayFilter].lineup}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                              <XAxis dataKey="slot" stroke="#6B7280" />
                              <YAxis stroke="#6B7280" domain={[0, 10]} />
                              <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: 11 }} />
                              <Area type="monotone" dataKey="energy" stroke="#10B981" fillOpacity={0.1} fill="#10B981" strokeWidth={2} name="Energy" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      <div className="bg-[#111827] p-4 rounded-xl border border-gray-800">
                        <h3 className="text-[11px] font-bold text-gray-300 mb-3">Grafik Distribusi Popularitas Artis</h3>
                        <div className="h-40 text-[9px] font-mono">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={optResults[resultDayFilter].lineup}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                              <XAxis dataKey="slot" stroke="#6B7280" />
                              <YAxis stroke="#6B7280" />
                              <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', fontSize: 11 }} />
                              <Area type="monotone" dataKey="popularity" stroke="#A855F7" fillOpacity={0.1} fill="#A855F7" strokeWidth={2} name="Popularity" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="text-center py-20 bg-[#111827] border border-gray-800 rounded-xl flex flex-col items-center shadow-xl">
                <BarChart3 size={32} className="text-gray-600 mb-2" />
                <h3 className="font-bold text-sm text-white">Belum Ada Perhitungan</h3>
                <button onClick={() => setActiveTab('optimasi')} className="mt-4 px-4 py-2 bg-[#10B981] text-black font-bold rounded-lg text-xs hover:opacity-90 transition-all">
                  Ke Halaman Parameter GA
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}