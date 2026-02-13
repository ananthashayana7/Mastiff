
import React, { useRef, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis, Brush,
  AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, RadialBarChart, RadialBar
} from 'recharts';
import { VisualizationData } from '../types';
import { Download, Table as TableIcon, FileText, ArrowUp, ArrowDown, Search, Filter, X, RefreshCw, Cpu, TrendingUp, MousePointer2, Maximize2, Minimize2 } from 'lucide-react';
import html2canvas from 'html2canvas';

const COLORS = ['#E50914', '#ff4d4d', '#ff6b6b', '#ff8585', '#B20710', '#F5F5F1', '#D2D2D2', '#564D4D', '#808080', '#A1060E'];

interface ChartRendererProps {
  viz: VisualizationData;
  onDrillDown?: (prompt: string) => void;
}

export const ChartRenderer: React.FC<ChartRendererProps> = ({ viz, onDrillDown }) => {
  const { type, data, config, title } = viz;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const [sortConfig, setSortConfig] = useState<{ key: string | null, direction: 'asc' | 'desc' }>({ key: null, direction: 'asc' });
  const [filters, setFilters] = useState<{ [key: string]: string }>({});
  const [isFilterActive, setIsFilterActive] = useState(false);

  const activeFilterCount = useMemo(() => Object.values(filters).filter((v: string) => v.trim() !== '').length, [filters]);

  const handleDataClick = (dataPoint: any) => {
    if (!onDrillDown) return;
    const xAxisLabel = config.xAxis || 'this category';
    const value = dataPoint[xAxisLabel] || 'this point';
    onDrillDown(`Provide a detailed analysis of the data for "${value}" in this chart.`);
  };

  const handleExportCSV = () => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [headers.join(','), ...data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `mastiff-${type}-${Date.now()}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportImage = async () => {
    if (!containerRef.current) return;
    try {
      const el = containerRef.current;
      const scrollablePart = el.querySelector('.overflow-x-auto') as HTMLElement;
      const originalMaxHeight = scrollablePart?.style.maxHeight || '';
      const originalOverflow = scrollablePart?.style.overflow || '';

      if (scrollablePart) {
        scrollablePart.style.maxHeight = 'none';
        scrollablePart.style.overflow = 'visible';
      }

      const canvas = await html2canvas(el, {
        backgroundColor: '#0a0a0a',
        scale: 2,
        useCORS: true
      });

      if (scrollablePart) {
        scrollablePart.style.maxHeight = originalMaxHeight;
        scrollablePart.style.overflow = originalOverflow;
      }

      const link = document.createElement('a');
      link.download = `mastiff-${type}-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error(`Export failed:`, err);
    }
  };

  const processedData = useMemo(() => {
    if (!data) return [];
    let result = [...data];
    Object.keys(filters).forEach(key => {
      const filterVal = filters[key].toLowerCase();
      if (filterVal) result = result.filter(row => String(row[key] ?? '').toLowerCase().includes(filterVal));
    });
    if (sortConfig.key) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key!];
        const bVal = b[sortConfig.key!];
        if (aVal === bVal) return 0;
        const aNum = Number(aVal);
        const bNum = Number(bVal);
        let comparison = isNaN(aNum) || isNaN(bNum) ? String(aVal).localeCompare(String(bVal)) : aNum - bNum;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }
    return result;
  }, [data, sortConfig, filters]);

  // Table rendering
  if (type === 'table') {
    if (!data || data.length === 0) return null;
    const headers = Object.keys(data[0]);
    return (
      <div ref={containerRef} className="w-full glass rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
        <div className="px-5 py-3.5 border-b border-zinc-800/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-[#E50914] text-white rounded-lg shadow-lg"><TableIcon size={14} /></div>
            <h3 className="text-[11px] font-extrabold text-white uppercase tracking-wider">{title}</h3>
            <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">{processedData.length} rows</span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setIsFilterActive(!isFilterActive)} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-[8px] font-extrabold uppercase tracking-widest ${isFilterActive ? 'bg-[#E50914] text-white' : 'glass text-zinc-500 hover:text-white'}`}>
              <Filter size={11} /> Filter {activeFilterCount > 0 && `(${activeFilterCount})`}
            </button>
            <button onClick={handleExportCSV} className="flex items-center gap-1.5 px-2.5 py-1.5 glass rounded-lg text-zinc-500 hover:text-white transition-all text-[8px] font-extrabold uppercase tracking-widest"><Download size={11} /> CSV</button>
            <button onClick={handleExportImage} className="flex items-center gap-1.5 px-2.5 py-1.5 glass rounded-lg text-zinc-500 hover:text-white transition-all text-[8px] font-extrabold uppercase tracking-widest"><Download size={11} /> PNG</button>
          </div>
        </div>
        {isFilterActive && (
          <div className="px-5 py-2 border-b border-zinc-800/30 flex gap-2 items-center animate-fade-in">
            {headers.slice(0, 4).map(h => (
              <input
                key={h}
                placeholder={`Filter ${h}...`}
                value={filters[h] || ''}
                onChange={e => setFilters(prev => ({ ...prev, [h]: e.target.value }))}
                className="flex-1 px-2.5 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-lg text-[9px] text-white font-medium placeholder:text-zinc-700 focus:border-[#E50914]/50"
              />
            ))}
            <button onClick={() => setFilters({})} className="p-1.5 text-zinc-600 hover:text-white"><X size={12} /></button>
          </div>
        )}
        <div className="overflow-x-auto max-h-96 custom-scrollbar">
          <table className="w-full text-sm text-left text-zinc-300">
            <thead className="text-[9px] text-zinc-600 uppercase bg-zinc-950/80 sticky top-0 z-10">
              <tr>
                {headers.map(h => (
                  <th key={h} className="px-5 py-3 font-extrabold border-b border-zinc-800/50 cursor-pointer hover:text-white transition-colors tracking-widest" onClick={() => { setSortConfig({ key: h, direction: sortConfig.key === h && sortConfig.direction === 'asc' ? 'desc' : 'asc' }); }}>
                    <div className="flex items-center gap-1.5">
                      {h} {sortConfig.key === h && (sortConfig.direction === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/50">
              {processedData.map((row, i) => (
                <tr key={i} className="hover:bg-[#E50914]/3 transition-colors cursor-pointer" onClick={() => handleDataClick(row)}>
                  {headers.map(h => <td key={h} className="px-5 py-3 whitespace-nowrap text-zinc-400 text-[11px] font-medium">{row[h]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    const tooltipStyle = { backgroundColor: '#0a0a0a', borderRadius: '12px', border: '1px solid #1f1f1f', color: '#fff', fontSize: '10px', fontWeight: '700', padding: '8px 12px', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' };
    const commonProps = { margin: { top: 10, right: 20, left: 0, bottom: 10 } };
    const axisProps = { axisLine: false, tickLine: false, tick: { fontSize: 9, fill: '#444', fontWeight: 600 } };

    switch (type) {
      case 'bar':
        return (
          <BarChart data={data} {...commonProps} onClick={(e) => (e as any)?.activePayload && handleDataClick((e as any).activePayload[0].payload)}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis dataKey={config.xAxis} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip cursor={{ fill: 'rgba(229, 9, 20, 0.04)' }} contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '9px', fontWeight: 800 }} />
            {config.keys?.map((key, i) => (
              <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} barSize={24} animationDuration={800} />
            ))}
            <Brush dataKey={config.xAxis} height={20} stroke="#E50914" fill="#0a0a0a" />
          </BarChart>
        );
      case 'line':
        return (
          <LineChart data={data} {...commonProps} onClick={(e) => (e as any)?.activePayload && handleDataClick((e as any).activePayload[0].payload)}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis dataKey={config.xAxis} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '9px', fontWeight: 800 }} />
            {config.keys?.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: COLORS[i % COLORS.length] }} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} animationDuration={1200} />
            ))}
            <Brush dataKey={config.xAxis} height={20} stroke="#E50914" fill="#0a0a0a" />
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={data} {...commonProps} onClick={(e) => (e as any)?.activePayload && handleDataClick((e as any).activePayload[0].payload)}>
            <defs>
              {config.keys?.map((key, i) => (
                <linearGradient key={`grad-${key}`} id={`gradient-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis dataKey={config.xAxis} {...axisProps} />
            <YAxis {...axisProps} />
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="top" height={30} wrapperStyle={{ fontSize: '9px', fontWeight: 800 }} />
            {config.keys?.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} fill={`url(#gradient-${i})`} animationDuration={1000} />
            ))}
          </AreaChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie data={data} innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value" nameKey="label" stroke="none" onClick={handleDataClick} animationDuration={800}>
              {data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: '9px', fontWeight: 700 }} />
          </PieChart>
        );
      case 'scatter':
        return (
          <ScatterChart {...commonProps} onClick={(e) => (e as any)?.activePayload && handleDataClick((e as any).activePayload[0].payload)}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1a1a1a" />
            <XAxis type="number" dataKey={config.xAxis} name={config.xAxis} {...axisProps} />
            <YAxis type="number" dataKey={config.yAxis} name={config.yAxis} {...axisProps} />
            <ZAxis range={[30, 200]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle as any} />
            <Scatter name="Data" data={data} fill="#E50914" onClick={(e) => handleDataClick(e)} shape="circle" />
          </ScatterChart>
        );
      case 'radar':
        return (
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="#1f1f1f" />
            <PolarAngleAxis dataKey={config.xAxis || 'subject'} tick={{ fontSize: 9, fill: '#666', fontWeight: 600 }} />
            <PolarRadiusAxis tick={{ fontSize: 8, fill: '#444' }} />
            {config.keys?.map((key, i) => (
              <Radar key={key} name={key} dataKey={key} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.15} strokeWidth={2} />
            ))}
            <Tooltip contentStyle={tooltipStyle as any} />
            <Legend wrapperStyle={{ fontSize: '9px', fontWeight: 800 }} />
          </RadarChart>
        );
      default:
        return <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-700"><RefreshCw className="animate-spin" size={28} /></div>;
    }
  };

  return (
    <div ref={containerRef} className={`w-full glass rounded-2xl p-5 shadow-2xl animate-fade-in group transition-all ${isExpanded ? 'fixed inset-4 z-50' : ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-2">
            <span className="w-1 h-5 bg-[#E50914] rounded-full" />
            {title}
          </h3>
          <p className="text-[8px] text-zinc-600 font-bold uppercase tracking-[2px] ml-3 mt-0.5 flex items-center gap-1">
            <MousePointer2 size={8} /> Click to drill down
          </p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 glass rounded-lg text-zinc-600 hover:text-white transition-all">
            {isExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          <button onClick={handleExportCSV} className="p-1.5 glass rounded-lg text-zinc-600 hover:text-white transition-all" title="Export CSV">
            <FileText size={12} />
          </button>
          <button onClick={handleExportImage} className="p-1.5 glass rounded-lg text-zinc-600 hover:text-white transition-all" title="Export Image">
            <Download size={12} />
          </button>
        </div>
      </div>
      <div className={`w-full ${isExpanded ? 'h-[calc(100vh-120px)]' : 'h-[320px]'}`}>
        <ResponsiveContainer width="100%" height="100%">
          {renderContent()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
