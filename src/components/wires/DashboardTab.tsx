import React, { useMemo, useState } from 'react';
import { 
  ComposedChart,
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  Legend,
  LabelList
} from 'recharts';
import { WireBatch, WireCoil, WireSupplier, ProductionLine } from '../../types';
import { DEFAULT_BUDGETED_PRODUCTION, DEFAULT_REAL_PRODUCTION } from '../../constants';
import { 
  TrendingUp, 
  Package, 
  ArrowUpRight, 
  ArrowDownRight, 
  Weight, 
  PieChart as PieChartIcon,
  Filter,
  Calendar,
  History,
  Search,
  Truck,
  X,
  ShieldAlert,
  Barcode
} from 'lucide-react';
import { cn, formatDateBR } from '../../lib/utils';

interface DashboardTabProps {
  batches: WireBatch[];
  coils: WireCoil[];
  suppliers: WireSupplier[];
  lines: ProductionLine[];
  startDate: string;
  endDate: string;
  productionData: any[];
}

export const DashboardTab: React.FC<DashboardTabProps> = ({ 
  batches, 
  coils: coilsProp, 
  suppliers, 
  lines,
  startDate,
  endDate,
  productionData
}) => {
  // Dynamically enrich or correct supplierName for every coil using supplier database or standard layout rules
  const coils = useMemo(() => {
    return coilsProp.map(c => {
      let supplierName = '';
      if (c.supplierId) {
        supplierName = suppliers.find(s => s.id === c.supplierId)?.name || '';
      }
      // Derivar o fornecedor a partir do código se estiver em branco ou indefinido
      if (!supplierName || supplierName === 'Desconhecido' || supplierName === 'Unknown') {
        const num = c.coilNumber?.toUpperCase() || '';
        if (num.startsWith('GD') || /GD\d{10,20}/i.test(num)) {
          supplierName = 'Morlan';
        } else if (/^\d{10}$/.test(num.trim())) {
          supplierName = 'Belgo';
        }
      }
      return {
        ...c,
        supplierName: supplierName || 'Desconhecido'
      };
    });
  }, [coilsProp, suppliers]);

  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterDiameter, setFilterDiameter] = useState<string>('');
  const [filterLine, setFilterLine] = useState('');
  const [kpiChartView, setKpiChartView] = useState<'monthly' | 'period'>('monthly');

  // Local lists states for available vs consumed
  const [coilSearch, setCoilSearch] = useState('');
  const [coilListTab, setCoilListTab] = useState<'available' | 'consumed'>('available');
  const [listFilterDiameter, setListFilterDiameter] = useState('');
  const [listFilterSupplier, setListFilterSupplier] = useState('');

  // Date parsing helper that gracefully handles Firestore Timestamps, ISO strings and Date objects
  const parseCoilDate = (dateVal: any): Date | null => {
    if (!dateVal) return null;
    if (typeof dateVal === 'object' && 'seconds' in dateVal) {
      return new Date(dateVal.seconds * 1000);
    }
    if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? null : dateVal;
    if (typeof dateVal === 'string' || typeof dateVal === 'number') {
      const d = new Date(dateVal);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  };

  // Safe local date range matching to avoid timezone UTC drift
  const isDateInRange = (d: Date, start?: string, end?: string): boolean => {
    if (start) {
      const [sY, sM, sD] = start.split('-').map(Number);
      const startDateObj = new Date(sY, sM - 1, sD, 0, 0, 0, 0);
      if (d < startDateObj) return false;
    }
    if (end) {
      const [eY, eM, eD] = end.split('-').map(Number);
      const endDateObj = new Date(eY, eM - 1, eD, 23, 59, 59, 999);
      if (d > endDateObj) return false;
    }
    return true;
  };

  // 1. Dynamic list of available (in-stock) coils filtered by search term, diameter, and supplier
  const filteredAvailableList = useMemo(() => {
    let list = coils.filter(c => c.status !== 'consumed');
    
    if (coilSearch) {
      const s = coilSearch.toLowerCase().trim();
      list = list.filter(c => 
        c.coilNumber.toLowerCase().includes(s) || 
        (c.supplierName && c.supplierName.toLowerCase().includes(s)) ||
        (c.storageBayName && c.storageBayName.toLowerCase().includes(s))
      );
    }
    
    if (listFilterDiameter) {
      list = list.filter(c => Math.abs(c.diameter - Number(listFilterDiameter)) < 0.01);
    }
    
    if (listFilterSupplier) {
      list = list.filter(c => c.supplierId === listFilterSupplier);
    }
    
    return list;
  }, [coils, coilSearch, listFilterDiameter, listFilterSupplier]);

  // 2. Dynamic list of consumed coils filtered by search term, diameter, and supplier
  const filteredConsumedList = useMemo(() => {
    let list = coils.filter(c => c.status === 'consumed');
    
    if (coilSearch) {
      const s = coilSearch.toLowerCase().trim();
      list = list.filter(c => 
        c.coilNumber.toLowerCase().includes(s) || 
        (c.consumedBy && c.consumedBy.toLowerCase().includes(s)) ||
        (c.consumedIn && c.consumedIn.toLowerCase().includes(s)) ||
        ((lines.find(l => l.id === c.currentLineId)?.name || '').toLowerCase().includes(s))
      );
    }
    
    if (listFilterDiameter) {
      list = list.filter(c => Math.abs(c.diameter - Number(listFilterDiameter)) < 0.01);
    }
    
    if (listFilterSupplier) {
      list = list.filter(c => c.supplierId === listFilterSupplier);
    }
    
    return list;
  }, [coils, lines, coilSearch, listFilterDiameter, listFilterSupplier]);

  // 3. Dynamic Recharts data for the active comparison chart
  const listGaugeChartData = useMemo(() => {
    const activeList = coilListTab === 'available' ? filteredAvailableList : filteredConsumedList;
    const uniqueD = Array.from(new Set(activeList.map(c => c.diameter))).sort((a, b) => Number(a) - Number(b));
    return uniqueD.map(d => {
      const subset = activeList.filter(c => c.diameter === d);
      return {
        name: `${(d as number).toFixed(2)} mm`,
        weight: subset.reduce((acc, c) => acc + (c.weight || 0), 0),
        count: subset.length
      };
    });
  }, [coilListTab, filteredAvailableList, filteredConsumedList]);

  // Analytics
  const filteredReceived = useMemo(() => {
    let filtered = [...coils];
    if (filterSupplier) filtered = filtered.filter(c => c.supplierId === filterSupplier);
    if (filterDiameter) filtered = filtered.filter(c => Math.abs(c.diameter - Number(filterDiameter)) < 0.01);
    
    if (startDate || endDate) {
      filtered = filtered.filter(c => {
        const receivedDate = parseCoilDate(c.receivedAt);
        if (!receivedDate) return false;
        return isDateInRange(receivedDate, startDate, endDate);
      });
    }
    return filtered;
  }, [coils, filterSupplier, filterDiameter, startDate, endDate]);

  const filteredConsumed = useMemo(() => {
    let filtered = coils.filter(c => c.status === 'consumed');
    if (filterSupplier) filtered = filtered.filter(c => c.supplierId === filterSupplier);
    if (filterDiameter) filtered = filtered.filter(c => Math.abs(c.diameter - Number(filterDiameter)) < 0.01);
    if (filterLine) filtered = filtered.filter(c => c.currentLineId === filterLine);
    
    if (startDate || endDate) {
      filtered = filtered.filter(c => {
        const consumedDate = parseCoilDate(c.consumedAt);
        if (!consumedDate) return false;
        return isDateInRange(consumedDate, startDate, endDate);
      });
    } else {
      // Default to last 30 days if no filter
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);
      filtered = filtered.filter(c => {
        const consumedDate = parseCoilDate(c.consumedAt);
        return consumedDate && consumedDate >= thirtyDaysAgo;
      });
    }
    return filtered;
  }, [coils, filterSupplier, filterDiameter, filterLine, startDate, endDate]);

  const stats = useMemo(() => {
    const totalReceived = filteredReceived.length;
    const totalWeight = filteredReceived.reduce((acc, c) => acc + (c.weight || 0), 0);
    const totalConsumed = filteredConsumed.length;
    const consumedWeight = filteredConsumed.reduce((acc, c) => acc + (c.weight || 0), 0);
    const currentStock = coils.filter(c => c.status !== 'consumed').length;
    const stockWeight = coils.filter(c => c.status !== 'consumed').reduce((acc, c) => acc + (c.weight || 0), 0);

    // Group by supplier (Only current stock for clarity)
    const stockCoils = coils.filter(c => c.status !== 'consumed');
    const bySupplier = suppliers.map(s => ({
      name: s.name,
      value: stockCoils.filter(c => c.supplierId === s.id).length,
      weight: stockCoils.filter(c => c.supplierId === s.id).reduce((acc, c) => acc + (c.weight || 0), 0)
    })).filter(s => s.value > 0);

    // Add unrecorded coils to distribution
    const supplierIds = new Set(suppliers.map(s => s.id));
    const unrecordedCount = stockCoils.filter(c => !c.supplierId || !supplierIds.has(c.supplierId)).length;
    if (unrecordedCount > 0) {
      bySupplier.push({
        name: 'Não Identificado',
        value: unrecordedCount,
        weight: stockCoils.filter(c => !c.supplierId || !supplierIds.has(c.supplierId)).reduce((acc, c) => acc + (c.weight || 0), 0)
      });
    }

    // Group by diameter - Dynamic extraction
    const uniqueDiameters = Array.from(new Set(coils.map(c => c.diameter))).sort((a, b) => Number(a) - Number(b));
    const byDiameter = uniqueDiameters.map(d => ({
      name: `${d} mm`,
      count: filteredReceived.filter(c => c.diameter === d).length,
      weight: filteredReceived.filter(c => c.diameter === d).reduce((acc, c) => acc + (c.weight || 0), 0)
    }));

    const consumptionByLine = lines.map(l => {
      const lineConsumedCoils = filteredConsumed.filter(c => c.currentLineId === l.id);
      return {
        name: `Linha ${l.name}`,
        value: lineConsumedCoils.length,
        weight: lineConsumedCoils.reduce((acc, c) => acc + (c.weight || 0), 0)
      };
    }).filter(l => l.value > 0);

    return {
      totalReceived,
      totalWeight,
      totalConsumed,
      consumedWeight,
      currentStock,
      stockWeight,
      bySupplier,
      byDiameter,
      byLine: consumptionByLine
    };
  }, [coils, filteredReceived, filteredConsumed, suppliers, lines]);

  // Industrial Efficiency KPI Engine (Consumo Real de Arames vs Produção de Celulose)
  const performanceStats = useMemo(() => {
    // Helper to get monthly production with fallbacks
    const getProductionTonsForMonth = (y: number, m: number): number => {
      const match = productionData.find(p => Number(p.year) === y && Number(p.month) === m);
      if (match && typeof match.productionTons === 'number' && match.productionTons > 0) {
        return match.productionTons;
      }
      return DEFAULT_REAL_PRODUCTION[m] || 150000;
    };

    const getBudgetedTonsForMonth = (y: number, m: number): number => {
      const match = productionData.find(p => Number(p.year) === y && Number(p.month) === m);
      if (match && typeof match.budgetedTons === 'number' && match.budgetedTons > 0) {
        return match.budgetedTons;
      }
      return DEFAULT_BUDGETED_PRODUCTION[m] || 150000;
    };

    // Calculate cellulose production for selected period (pro-rata daily)
    let periodProductionTons = 0;
    let periodBudgetedTons = 0;
    let periodDaysCount = 0;
    let periodLabel = 'Últimos 30 dias';

    if (startDate || endDate) {
      const sStr = startDate || endDate;
      const eStr = endDate || startDate;
      const [sY, sM, sD] = sStr.split('-').map(Number);
      const [eY, eM, eD] = eStr.split('-').map(Number);

      const cur = new Date(sY, sM - 1, sD);
      const last = new Date(eY, eM - 1, eD);

      if (cur <= last) {
        while (cur <= last) {
          const y = cur.getFullYear();
          const m = cur.getMonth() + 1;
          const daysInMonth = new Date(y, m, 0).getDate();
          
          periodProductionTons += getProductionTonsForMonth(y, m) / daysInMonth;
          periodBudgetedTons += getBudgetedTonsForMonth(y, m) / daysInMonth;
          periodDaysCount++;
          
          cur.setDate(cur.getDate() + 1);
        }
      }
      periodLabel = startDate && endDate 
        ? `${formatDateBR(startDate)} a ${formatDateBR(endDate)} (${periodDaysCount} ${periodDaysCount === 1 ? 'dia' : 'dias'})`
        : formatDateBR(startDate || endDate);
    } else {
      // Default to last 30 days pro-rata
      const today = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const daysInMonth = new Date(y, m, 0).getDate();
        periodProductionTons += getProductionTonsForMonth(y, m) / daysInMonth;
        periodBudgetedTons += getBudgetedTonsForMonth(y, m) / daysInMonth;
        periodDaysCount++;
      }
      periodLabel = 'Últimos 30 dias';
    }

    // Total consumed wire in filtered period
    const totalConsumedKg = filteredConsumed.reduce((acc, c) => acc + (c.weight || 0), 0);
    const totalConsumedCoils = filteredConsumed.length;

    // Specific consumption (kg of wire per ton of cellulose)
    const currentSpecific = periodProductionTons > 0 ? (totalConsumedKg / periodProductionTons) : 0;
    // Meta operacional média (~1.93 kg/ton conforme mix histórico de consumíveis da fábrica)
    const defaultMeta = 1.93;
    const budgetSpecific = periodBudgetedTons > 0 && periodProductionTons > 0
      ? defaultMeta
      : defaultMeta;
    const deltaVsBudget = budgetSpecific > 0 ? ((currentSpecific - budgetSpecific) / budgetSpecific) * 100 : 0;

    // 1. Monthly Trend (last 6 months) respecting active filters (supplier, diameter, line)
    const monthsTrend = [];
    const now = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;

      // Coils consumed in this specific month matching current filters
      const monthCoils = coils.filter(c => {
        if (c.status !== 'consumed') return false;
        const cDate = parseCoilDate(c.consumedAt);
        if (!cDate || cDate.getFullYear() !== year || (cDate.getMonth() + 1) !== month) return false;
        if (filterSupplier && c.supplierId !== filterSupplier) return false;
        if (filterDiameter && Math.abs(c.diameter - Number(filterDiameter)) >= 0.01) return false;
        if (filterLine && c.currentLineId !== filterLine) return false;
        return true;
      });

      const monthKg = monthCoils.reduce((acc, c) => acc + (c.weight || 0), 0);
      const monthTons = getProductionTonsForMonth(year, month);
      const monthSpecific = monthTons > 0 ? Number((monthKg / monthTons).toFixed(2)) : 0;

      monthsTrend.push({
        label: d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''),
        kg: monthKg,
        tons: Math.round(monthTons),
        specific: monthSpecific,
        year,
        month
      });
    }

    // 2. Daily evolution for the selected period (if <= 45 days)
    let periodTrend: Array<{ label: string; kg: number; tons: number; specific: number }> = [];
    if ((startDate || endDate) && periodDaysCount <= 45 && periodDaysCount > 1) {
      const sStr = startDate || endDate;
      const [sY, sM, sD] = sStr.split('-').map(Number);
      const cur = new Date(sY, sM - 1, sD);
      const eStr = endDate || startDate;
      const [eY, eM, eD] = eStr.split('-').map(Number);
      const last = new Date(eY, eM - 1, eD);

      while (cur <= last) {
        const y = cur.getFullYear();
        const m = cur.getMonth() + 1;
        const dayNum = cur.getDate();
        const daysInMonth = new Date(y, m, 0).getDate();
        const dailyTons = getProductionTonsForMonth(y, m) / daysInMonth;

        const dayCoils = filteredConsumed.filter(c => {
          const cDate = parseCoilDate(c.consumedAt);
          return cDate && cDate.getFullYear() === y && (cDate.getMonth() + 1) === m && cDate.getDate() === dayNum;
        });

        const dayKg = dayCoils.reduce((acc, c) => acc + (c.weight || 0), 0);
        const daySpecific = dailyTons > 0 ? Number((dayKg / dailyTons).toFixed(2)) : 0;

        periodTrend.push({
          label: `${String(dayNum).padStart(2, '0')}/${String(m).padStart(2, '0')}`,
          kg: dayKg,
          tons: Math.round(dailyTons),
          specific: daySpecific
        });

        cur.setDate(cur.getDate() + 1);
      }
    }

    // 3. Breakdown by Supplier in the filtered period
    const sortedSuppliers = [...suppliers].sort((a, b) => a.name.localeCompare(b.name));
    const suppliersBreakdown = sortedSuppliers.map(s => {
      const sCoils = filteredConsumed.filter(c => c.supplierId === s.id);
      const kg = sCoils.reduce((acc, c) => acc + (c.weight || 0), 0);
      const specific = periodProductionTons > 0 ? Number((kg / periodProductionTons).toFixed(2)) : 0;
      const share = totalConsumedKg > 0 ? Number(((kg / totalConsumedKg) * 100).toFixed(1)) : 0;
      return {
        id: s.id,
        name: s.name,
        kg,
        count: sCoils.length,
        specific,
        share
      };
    }).filter(s => s.kg > 0);

    // Unrecorded supplier check
    const knownSupplierIds = new Set(suppliers.map(s => s.id));
    const unrecordedCoils = filteredConsumed.filter(c => !c.supplierId || !knownSupplierIds.has(c.supplierId));
    if (unrecordedCoils.length > 0) {
      const kg = unrecordedCoils.reduce((acc, c) => acc + (c.weight || 0), 0);
      suppliersBreakdown.push({
        id: 'unrecorded',
        name: 'Não Identificado',
        kg,
        count: unrecordedCoils.length,
        specific: periodProductionTons > 0 ? Number((kg / periodProductionTons).toFixed(2)) : 0,
        share: totalConsumedKg > 0 ? Number(((kg / totalConsumedKg) * 100).toFixed(1)) : 0
      });
    }

    // 4. Breakdown by Diameter in the filtered period
    const uniqueConsumedDiameters = Array.from(new Set(filteredConsumed.map(c => c.diameter))).sort((a, b) => Number(a) - Number(b));
    const diametersBreakdown = uniqueConsumedDiameters.map(dia => {
      const dCoils = filteredConsumed.filter(c => Math.abs(c.diameter - Number(dia)) < 0.01);
      const kg = dCoils.reduce((acc, c) => acc + (c.weight || 0), 0);
      const specific = periodProductionTons > 0 ? Number((kg / periodProductionTons).toFixed(2)) : 0;
      const share = totalConsumedKg > 0 ? Number(((kg / totalConsumedKg) * 100).toFixed(1)) : 0;
      return {
        name: `${Number(dia).toFixed(2)} mm`,
        kg,
        count: dCoils.length,
        specific,
        share
      };
    });

    // 5. Breakdown by Line / Machine in the filtered period
    const linesBreakdown = lines.map(l => {
      const lCoils = filteredConsumed.filter(c => c.currentLineId === l.id);
      const kg = lCoils.reduce((acc, c) => acc + (c.weight || 0), 0);
      const specific = periodProductionTons > 0 ? Number((kg / periodProductionTons).toFixed(2)) : 0;
      const share = totalConsumedKg > 0 ? Number(((kg / totalConsumedKg) * 100).toFixed(1)) : 0;
      return {
        id: l.id,
        name: l.name,
        kg,
        count: lCoils.length,
        specific,
        share
      };
    }).filter(l => l.kg > 0);

    return {
      periodProductionTons,
      periodBudgetedTons,
      periodDaysCount,
      totalConsumedKg,
      totalConsumedCoils,
      currentSpecific,
      budgetSpecific,
      deltaVsBudget,
      trend: monthsTrend,
      periodTrend,
      suppliers: suppliersBreakdown,
      diameters: diametersBreakdown,
      lines: linesBreakdown,
      label: periodLabel
    };
  }, [coils, filteredConsumed, productionData, suppliers, lines, startDate, endDate, filterSupplier, filterDiameter, filterLine]);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  const uniqueAvailableDiameters = useMemo(() => {
    return Array.from(new Set(coils.map(c => c.diameter))).sort((a, b) => Number(a) - Number(b));
  }, [coils]);

  return (
    <div className="space-y-8">
      {/* Filters (Supplier, Diameter & Line) */}
      <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500 uppercase">Filtros:</span>
        </div>

        <select
          value={filterSupplier}
          onChange={(e) => setFilterSupplier(e.target.value)}
          className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Todos Fornecedores</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={filterDiameter}
          onChange={(e) => setFilterDiameter(e.target.value)}
          className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Todas Bitolas</option>
          {uniqueAvailableDiameters.map(d => (
            <option key={d} value={d.toString()}>{d} mm</option>
          ))}
        </select>

        <select
          value={filterLine}
          onChange={(e) => setFilterLine(e.target.value)}
          className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">Todas as Linhas / Máquinas</option>
          {lines.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        {(filterSupplier || filterDiameter || filterLine) && (
          <button
            onClick={() => { setFilterSupplier(''); setFilterDiameter(''); setFilterLine(''); }}
            className="flex items-center gap-2 px-4 py-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-all text-sm font-black w-full sm:w-auto justify-center"
          >
            <X className="w-4 h-4" />
            Limpar Filtros
          </button>
        )}
      </div>

      {/* Stats Cards - Improved for high density and readability */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
              <Package className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Recebido</span>
              <span className="text-xs font-bold text-slate-500">Carga Atual</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-black text-slate-900 leading-none">{stats.totalReceived}</p>
            <p className="text-sm font-black text-slate-400 uppercase tracking-tighter">unids</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shadow-inner">
              <Weight className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Peso Bruto</span>
              <span className="text-xs font-bold text-slate-500">Total Período</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-black text-slate-900 leading-none">{stats.totalWeight.toLocaleString()}</p>
            <p className="text-sm font-black text-slate-400 uppercase tracking-tighter">kg</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shadow-inner">
              <History className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Consumo</span>
              <span className="text-xs font-bold text-slate-500">Produzido</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-black text-slate-900 leading-none">{stats.totalConsumed}</p>
            <p className="text-sm font-black text-slate-400 uppercase tracking-tighter">bobinas</p>
          </div>
        </div>

        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl shadow-slate-200/50 group">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-400 rounded-2xl flex items-center justify-center shadow-inner ring-1 ring-emerald-500/20">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Inventário</span>
              <span className="text-xs font-bold text-emerald-500/60">Disponível</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-4xl font-black text-white leading-none group-hover:scale-110 transition-transform origin-left">{stats.currentStock}</p>
            <p className="text-xs font-black text-emerald-500/40 uppercase tracking-tighter">{stats.stockWeight.toLocaleString()} kg em estoque</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-8 lg:gap-10">
        {/* Suppliers Pie - Left Column */}
        <div className="lg:col-span-12 2xl:col-span-4 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg lg:text-xl font-black text-slate-900 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-emerald-600" />
              Estoque por Fornecedor
            </h3>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.bySupplier}
                  cx="50%"
                  cy="45%"
                  innerRadius={45}
                  outerRadius={65}
                  paddingAngle={6}
                  dataKey="value"
                  stroke="none"
                >
                  {stats.bySupplier.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} cornerRadius={4} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '1.25rem', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)' }}
                />
                <Legend 
                  iconType="circle" 
                  layout="horizontal" 
                  align="center" 
                  verticalAlign="bottom"
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4">
             {stats.bySupplier.slice(0, 4).map((s, idx) => (
               <div key={idx} className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                 <p className="text-[10px] font-black text-slate-400 uppercase mb-1 truncate">{s.name}</p>
                 <p className="text-sm font-black text-slate-900">{s.weight.toLocaleString()} kg</p>
               </div>
             ))}
          </div>
        </div>

        {/* Consumed by Line - Right Column (Wider) */}
        <div className="lg:col-span-12 2xl:col-span-8 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <h3 className="text-lg lg:text-xl font-black text-slate-900 flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              Consumo Detalhado por Linha
            </h3>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-black uppercase rounded-lg tracking-widest shadow-sm">
              <Calendar className="w-3.5 h-3.5" />
              {startDate || endDate ? 'Período Filtrado' : 'Últimos 30 dias'}
            </div>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-12 gap-8 flex-grow">
            <div className="2xl:col-span-8 h-72 min-w-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byLine} margin={{ top: 20, right: 15, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '1.25rem', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[12, 12, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="2xl:col-span-4 flex flex-col min-w-0">
               <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-x-auto flex-grow max-w-full">
                  <table className="w-full text-left min-w-[340px]">
                    <thead className="bg-slate-100/50">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-200">
                        <th className="px-4 py-3">Linha</th>
                        <th className="px-4 py-3 text-center">Unids</th>
                        <th className="px-4 py-3 text-right">Massa (kg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {stats.byLine.map((item, idx) => (
                        <tr key={`line-row-${item.name}-${idx}`} className="text-sm font-bold text-slate-700 hover:bg-white transition-colors group">
                          <td className="px-4 py-3.5 flex items-center gap-2">
                             <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                             {item.name}
                          </td>
                          <td className="px-4 py-3.5 text-center text-slate-900 bg-white/40">{item.value}</td>
                          <td className="px-4 py-3.5 text-right font-black text-emerald-600 tabular-nums">{item.weight.toLocaleString()}</td>
                        </tr>
                      ))}
                      {stats.byLine.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-12 text-center text-slate-400 text-xs italic font-medium">Nenhum consumo detectado no período.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>
        </div>

        {/* Diameters & Efficiency Section */}
        <div className="lg:col-span-12 grid grid-cols-1 2xl:grid-cols-12 gap-8 lg:gap-10">
          
          {/* Diameters Bar */}
          <div className="2xl:col-span-5 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-lg lg:text-xl font-black text-slate-900 mb-8 flex items-center gap-2">
              <Filter className="w-5 h-5 text-amber-600" />
              Volume por Bitola (mm)
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.byDiameter} layout="vertical" margin={{ left: 10, right: 60, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontWeight: 900, fontSize: 12 }} width={80} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                  <Bar dataKey="weight" name="Peso (kg)" fill="#10b981" radius={[0, 12, 12, 0]} barSize={44}>
                     <LabelList 
                        dataKey="count" 
                        position="right" 
                        formatter={(val: number) => `${val} uni`}
                        style={{ fill: '#475569', fontWeight: 900, fontSize: 12 }}
                        offset={10}
                     />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Specific Consumption - THE MAIN KPIs */}
          <div className="2xl:col-span-7 bg-white p-8 rounded-3xl border-2 border-emerald-500/20 shadow-xl shadow-emerald-50 relative overflow-hidden group">
             {/* Decorative Background Element */}
             <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 rounded-full blur-3xl opacity-40 -mr-32 -mt-32 group-hover:opacity-60 transition-opacity" />
             
             <div className="relative z-10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                  <div>
                    <h3 className="text-xl lg:text-2xl font-black text-slate-900 flex items-center gap-3">
                      <TrendingUp className="w-6 h-6 text-emerald-600" />
                      KPI de Eficiência Industrial de Arames
                    </h3>
                    <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
                      Relação direta de consumo de arame (kg) por tonelada de celulose produzida ({performanceStats.label}).
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {performanceStats.periodTrend && performanceStats.periodTrend.length > 0 && (
                      <div className="flex bg-slate-100 p-1 rounded-xl text-[10px] font-black uppercase">
                        <button
                          type="button"
                          onClick={() => setKpiChartView('monthly')}
                          className={cn(
                            "px-3 py-1 rounded-lg transition-all",
                            kpiChartView === 'monthly' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                          )}
                        >
                          6 Meses
                        </button>
                        <button
                          type="button"
                          onClick={() => setKpiChartView('period')}
                          className={cn(
                            "px-3 py-1 rounded-lg transition-all",
                            kpiChartView === 'period' ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                          )}
                        >
                          Evolução Período
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white text-[10px] font-black uppercase rounded-full shadow-md shadow-emerald-200 tracking-wider">
                       <ShieldAlert className="w-3.5 h-3.5" />
                       Tempo Real
                    </div>
                  </div>
                </div>

                {/* Filter info badges */}
                {(filterSupplier || filterDiameter || filterLine || startDate || endDate) && (
                  <div className="flex flex-wrap items-center gap-2 mb-6">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filtros Ativos:</span>
                    {filterSupplier && (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-100">
                        {suppliers.find(s => s.id === filterSupplier)?.name || 'Fornecedor'}
                      </span>
                    )}
                    {filterDiameter && (
                      <span className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-100">
                        Bitola {filterDiameter} mm
                      </span>
                    )}
                    {filterLine && (
                      <span className="px-2.5 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-lg border border-purple-100">
                        {lines.find(l => l.id === filterLine)?.name || 'Linha'}
                      </span>
                    )}
                    {(startDate || endDate) && (
                      <span className="px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg border border-slate-200">
                        {performanceStats.label}
                      </span>
                    )}
                  </div>
                )}
                
                {/* Composed Chart combining Bar (kg and tons) + Line (kg/ton) */}
                <div className="h-72 mb-8">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart 
                      data={kpiChartView === 'period' && performanceStats.periodTrend && performanceStats.periodTrend.length > 0
                        ? performanceStats.periodTrend 
                        : performanceStats.trend} 
                      margin={{ top: 20, right: 30, left: 10, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="label" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 800 }} 
                      />
                      <YAxis 
                        yAxisId="left" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
                        tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                      />
                      <YAxis 
                        yAxisId="right" 
                        orientation="right" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#10b981', fontSize: 11, fontWeight: 900 }}
                        unit=" kg/t"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          borderRadius: '1.25rem', 
                          border: 'none', 
                          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                          padding: '12px 16px',
                          fontWeight: 700
                        }}
                        formatter={(value: any, name: string) => {
                          const val = Number(value) || 0;
                          if (name.includes('kg/ton') || name.includes('Consumo Específico')) {
                            return [`${val.toFixed(2)} kg/ton`, 'Consumo Específico'];
                          }
                          if (name.includes('Arame') || name.includes('Consumido')) {
                            return [`${val.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`, 'Arame Consumido'];
                          }
                          if (name.includes('Produção') || name.includes('Prod.')) {
                            return [`${Math.round(val).toLocaleString('pt-BR')} ton`, 'Produção de Celulose'];
                          }
                          return [value, name];
                        }}
                      />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '16px', fontSize: '12px', fontWeight: 700 }} />
                      <Bar yAxisId="left" dataKey="kg" name="Arame Consumido (kg)" fill="#3b82f6" radius={[6, 6, 0, 0]} barSize={20} />
                      <Bar yAxisId="left" dataKey="tons" name="Produção Celulose (ton)" fill="#94a3b8" radius={[6, 6, 0, 0]} barSize={20} />
                      <Line 
                        yAxisId="right" 
                        type="monotone" 
                        dataKey="specific" 
                        name="Consumo Específico (kg/ton)" 
                        stroke="#10b981" 
                        strokeWidth={3.5} 
                        dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 7 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Key Metrics Cards in dark banner */}
                <div className="p-6 bg-slate-900 rounded-[2rem] border border-slate-700 flex flex-col gap-6">
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pb-6 border-b border-slate-800">
                      <div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Consumo Específico</p>
                         <div className="flex items-baseline gap-1.5">
                            <p className="text-3xl font-black text-emerald-400">{performanceStats.currentSpecific.toFixed(2)}</p>
                            <span className="text-[10px] text-emerald-300 font-bold uppercase">kg/ton</span>
                         </div>
                      </div>

                      <div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Arame Consumido</p>
                         <div className="flex items-baseline gap-1.5">
                            <p className="text-xl sm:text-2xl font-black text-white">{performanceStats.totalConsumedKg.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">kg ({performanceStats.totalConsumedCoils} bob.)</span>
                         </div>
                      </div>

                      <div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Produção Celulose</p>
                         <div className="flex items-baseline gap-1.5">
                            <p className="text-xl sm:text-2xl font-black text-white">{Math.round(performanceStats.periodProductionTons).toLocaleString('pt-BR')}</p>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">ton ({performanceStats.periodDaysCount}d)</span>
                         </div>
                      </div>

                      <div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Meta Referência</p>
                         <div className="flex items-baseline gap-2">
                            <p className="text-xl sm:text-2xl font-black text-slate-300">{performanceStats.budgetSpecific.toFixed(2)}</p>
                            <span className={cn(
                              "text-xs font-black px-2 py-0.5 rounded-md",
                              performanceStats.deltaVsBudget <= 5 
                                ? "bg-emerald-500/20 text-emerald-400" 
                                : performanceStats.deltaVsBudget <= 15 
                                ? "bg-amber-500/20 text-amber-400" 
                                : "bg-rose-500/20 text-rose-400"
                            )}>
                              {performanceStats.deltaVsBudget > 0 ? `+${performanceStats.deltaVsBudget.toFixed(1)}%` : `${performanceStats.deltaVsBudget.toFixed(1)}%`}
                            </span>
                         </div>
                      </div>
                   </div>

                   <div className="flex items-start sm:items-center gap-3">
                      <div className={cn(
                        "w-3.5 h-3.5 rounded-full shrink-0 mt-0.5 sm:mt-0 shadow-lg",
                        performanceStats.currentSpecific === 0 
                          ? "bg-slate-500" 
                          : performanceStats.currentSpecific <= 1.95 
                          ? "bg-emerald-500 shadow-emerald-500/30" 
                          : performanceStats.currentSpecific <= 2.20 
                          ? "bg-amber-500 shadow-amber-500/30" 
                          : "bg-rose-500 shadow-rose-500/30 animate-pulse"
                      )} />
                      <p className="text-xs font-medium text-slate-300 leading-relaxed italic">
                        {performanceStats.currentSpecific === 0 
                          ? "Nenhum consumo de arame registrado para os filtros ativos no período."
                          : performanceStats.currentSpecific <= 1.95 
                          ? "Eficiência Operacional Excelente: O consumo de arame está rigorosamente alinhado à meta de enfardamento (1,93 kg/ton)."
                          : performanceStats.currentSpecific <= 2.20 
                          ? "Atenção Operacional: O consumo específico está ligeiramente superior à meta de referência (1,93 kg/ton). Acompanhe o consumo e possíveis sobras."
                          : "Alerta de Consumo Elevado: Consumo específico acima dos parâmetros recomendados. Verifique se ocorreram rompimentos ou desvios na amarradeira."}
                      </p>
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* Breakdown of Efficiency Standalone Card */}
        <div className="lg:col-span-12 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm transition-all hover:shadow-md">
           <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-lg lg:text-xl font-black text-slate-900 flex items-center gap-2">
                   <TrendingUp className="w-5 h-5 text-emerald-600 animate-pulse" />
                   Detalhamento de Eficiência de Consumo
                </h3>
                <p className="text-xs text-slate-400 font-bold mt-1">
                  Distribuição da eficiência (kg por tonelada) por Fornecedor, Bitola e Linha de Enfardamento.
                </p>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-xl text-slate-600 text-xs font-black uppercase tracking-wider">
                 <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                 {performanceStats.label}
              </div>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Breakdown by Supplier */}
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100/50 flex flex-col">
                 <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                       <Truck className="w-4 h-4 text-emerald-600" />
                       Por Fornecedor (kg/ton)
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">Total: {performanceStats.suppliers.length}</span>
                 </div>
                 <div className="space-y-3 flex-1">
                    {performanceStats.suppliers.map((s: any, idx: number) => (
                       <div key={`${s.name}-${idx}`} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                          <div className="flex justify-between items-center text-xs font-black text-slate-800 mb-1">
                             <span className="truncate" title={s.name}>{s.name}</span>
                             <span className="text-emerald-600 shrink-0 font-black">{s.specific.toFixed(2)} kg/ton</span>
                          </div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                             <span>{s.kg.toLocaleString('pt-BR')} kg ({s.count} bobinas)</span>
                             <span>{s.share}% do total</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                             <div 
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${Math.min(100, (s.specific / (performanceStats.currentSpecific || 1)) * 100)}%` }}
                             />
                          </div>
                       </div>
                    ))}
                    {(!performanceStats.suppliers || performanceStats.suppliers.length === 0) && (
                       <p className="text-xs italic text-slate-400 py-6 text-center">Nenhum consumo de fornecedor no período filtrado.</p>
                    )}
                 </div>
              </div>

              {/* Breakdown by Diameter */}
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100/50 flex flex-col">
                 <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                       <Weight className="w-4 h-4 text-blue-600" />
                       Por Bitola (kg/ton)
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">Total: {performanceStats.diameters.length}</span>
                 </div>
                 <div className="space-y-3 flex-1">
                    {performanceStats.diameters.map((d: any, idx: number) => (
                       <div key={`${d.name}-${idx}`} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                          <div className="flex justify-between items-center text-xs font-black text-slate-800 mb-1">
                             <span className="truncate" title={d.name}>{d.name}</span>
                             <span className="text-blue-600 shrink-0 font-black">{d.specific.toFixed(2)} kg/ton</span>
                          </div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                             <span>{d.kg.toLocaleString('pt-BR')} kg ({d.count} bobinas)</span>
                             <span>{d.share}% do total</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                             <div 
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${Math.min(100, (d.specific / (performanceStats.currentSpecific || 1)) * 100)}%` }}
                             />
                          </div>
                       </div>
                    ))}
                    {(!performanceStats.diameters || performanceStats.diameters.length === 0) && (
                       <p className="text-xs italic text-slate-400 py-6 text-center">Nenhum consumo de bitola no período filtrado.</p>
                    )}
                 </div>
              </div>

              {/* Breakdown by Production Line */}
              <div className="bg-slate-50/50 p-6 rounded-2xl border border-slate-100/50 flex flex-col">
                 <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                       <TrendingUp className="w-4 h-4 text-purple-600" />
                       Por Linha / Máquina (kg/ton)
                    </h4>
                    <span className="text-[10px] font-bold text-slate-400">Total: {performanceStats.lines.length}</span>
                 </div>
                 <div className="space-y-3 flex-1">
                    {performanceStats.lines.map((l: any, idx: number) => (
                       <div key={`${l.name}-${idx}`} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                          <div className="flex justify-between items-center text-xs font-black text-slate-800 mb-1">
                             <span className="truncate" title={l.name}>Linha {l.name}</span>
                             <span className="text-purple-600 shrink-0 font-black">{l.specific.toFixed(2)} kg/ton</span>
                          </div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5">
                             <span>{l.kg.toLocaleString('pt-BR')} kg ({l.count} bobinas)</span>
                             <span>{l.share}% do total</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                             <div 
                                className="h-full bg-purple-500 rounded-full transition-all"
                                style={{ width: `${Math.min(100, (l.specific / (performanceStats.currentSpecific || 1)) * 100)}%` }}
                             />
                          </div>
                       </div>
                    ))}
                    {(!performanceStats.lines || performanceStats.lines.length === 0) && (
                       <p className="text-xs italic text-slate-400 py-6 text-center">Nenhum consumo associado a linha no período filtrado.</p>
                    )}
                 </div>
              </div>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-100 bg-slate-50/40 p-6 rounded-2xl border border-slate-100">
              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Consumo Total</p>
                 <p className="text-lg font-black text-slate-900 leading-none">
                   {performanceStats.totalConsumedKg.toLocaleString('pt-BR')} <span className="text-xs text-slate-400 font-bold">kg</span>
                 </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Produção Celulose</p>
                 <p className="text-lg font-black text-slate-900 leading-none">
                   {Math.round(performanceStats.periodProductionTons).toLocaleString('pt-BR')} <span className="text-xs text-slate-400 font-bold">ton</span>
                 </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Consumo Específico Real</p>
                 <p className="text-lg font-black text-emerald-600 leading-none">
                   {performanceStats.currentSpecific.toFixed(2)} <span className="text-xs text-emerald-500 font-bold">kg/ton</span>
                 </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Meta Orçada</p>
                 <p className="text-lg font-black text-slate-700 leading-none">
                   {performanceStats.budgetSpecific.toFixed(2)} <span className="text-xs text-slate-400 font-bold">kg/ton</span>
                 </p>
              </div>
           </div>
        </div>

        {/* SEÇÃO ADICIONADA: PESQUISA, FILTROS E GRÁFICO DE BOBINAS DISPONÍVEIS E CONSUMIDAS */}
        <div className="bg-white p-6 md:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm mt-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg lg:text-xl font-black text-slate-900 flex items-center gap-2">
                <Barcode className="w-5 h-5 text-indigo-600" />
                Consulta e Análise de Bobinas
              </h3>
              <p className="text-xs text-slate-400 font-bold mt-1 font-sans">
                Visualize os saldos, distribuições por bitola e fichas detalhadas de estoque vs histórico de consumo.
              </p>
            </div>
            
            {/* Tabs Selector */}
            <div className="flex p-1 bg-slate-100 rounded-2xl self-start md:self-center border border-slate-200/50 space-x-1">
              <button
                type="button"
                onClick={() => setCoilListTab('available')}
                className={cn(
                  "px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-2",
                  coilListTab === 'available'
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <Package className="w-3.5 h-3.5" />
                Estoque Disponível ({filteredAvailableList.length})
              </button>
              <button
                type="button"
                onClick={() => setCoilListTab('consumed')}
                className={cn(
                  "px-4 py-2 text-xs font-black rounded-xl transition-all flex items-center gap-2",
                  coilListTab === 'consumed'
                    ? "bg-white text-indigo-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <History className="w-3.5 h-3.5" />
                Dado Baixa/Consumido ({filteredConsumedList.length})
              </button>
            </div>
          </div>

          {/* Local Filters Toolbar */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            <div className="sm:col-span-6 relative">
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por código/tag, fornecedor, etc..."
                value={coilSearch}
                onChange={(e) => setCoilSearch(e.target.value)}
                className="w-full pl-9 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-slate-400"
              />
              {coilSearch && (
                <button 
                  type="button"
                  onClick={() => setCoilSearch('')}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 font-extrabold"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="sm:col-span-3">
              <select
                value={listFilterDiameter}
                onChange={(e) => setListFilterDiameter(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Todas Bitolas</option>
                {uniqueAvailableDiameters.map(d => (
                  <option key={`list-dia-${d}`} value={d.toString()}>{d.toFixed(2)} mm</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <select
                value={listFilterSupplier}
                onChange={(e) => setListFilterSupplier(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Todos Fornecedores</option>
                {suppliers.map(s => (
                  <option key={`list-sup-${s.id}`} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-12 gap-6 items-start">
            
            {/* Dynamic visual breakdown chart */}
            <div className="2xl:col-span-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
              <h4 className="text-xs font-black text-slate-950 uppercase tracking-widest mb-4 flex items-center gap-1.5 font-sans">
                <TrendingUp className="w-4 h-4 text-indigo-600" />
                Peso Filtrado por Bitola (mm)
              </h4>
              
              <div className="h-60 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={listGaugeChartData} margin={{ left: -15, right: 10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10, fontWeight: 900 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 9, fontWeight: 900 }} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                      formatter={(val: any) => [`${Number(val).toLocaleString()} kg`]}
                    />
                    <Bar 
                      dataKey="weight" 
                      fill={coilListTab === 'available' ? "#6366f1" : "#f59e0b"} 
                      radius={[8, 8, 0, 0]} 
                      barSize={28}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs py-2 px-3 bg-white rounded-xl border border-slate-100">
                <span className="font-bold text-slate-400">Peso Total na Seção:</span>
                <span className="font-extrabold text-slate-800">
                  {coilListTab === 'available' 
                    ? filteredAvailableList.reduce((acc, c) => acc + (c.weight || 0), 0).toLocaleString() 
                    : filteredConsumedList.reduce((acc, c) => acc + (c.weight || 0), 0).toLocaleString()
                  } kg
                </span>
              </div>
            </div>

            {/* List Table Data Grid */}
            <div className="2xl:col-span-8 overflow-x-auto min-w-0">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-205 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100/50">
                    <th className="py-2.5 px-3">Código / Tag</th>
                    <th className="py-2.5 px-3 text-center">Bitola</th>
                    <th className="py-2.5 px-3 text-right">Massa</th>
                    <th className="py-2.5 px-3">Fornecedor</th>
                    <th className="py-2.5 px-3 text-right">Local / Linha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(coilListTab === 'available' ? filteredAvailableList : filteredConsumedList)
                    .slice(0, 10)
                    .map((item, idx) => {
                      return (
                        <tr key={`list-row-${item.id}-${idx}`} className="text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all">
                          <td className="py-3 px-3 font-extrabold text-slate-900 flex items-center gap-2">
                            <div className={cn(
                              "w-2 h-2 rounded-full shrink-0",
                              coilListTab === 'available' ? "bg-indigo-500 animate-pulse" : "bg-amber-500"
                            )} />
                            {item.coilNumber}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="text-[11px] font-black bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                              {item.diameter.toFixed(2)} mm
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-black text-slate-800 tabular-nums">
                            {item.weight?.toLocaleString()} kg
                          </td>
                          <td className="py-3 px-3 text-slate-500 text-xs truncate max-w-[120px]" title={item.supplierName || 'Fornecedor Desconhecido'}>
                            {item.supplierName || 'Desconhecido'}
                          </td>
                          <td className="py-3 px-3 text-right text-xs">
                            {coilListTab === 'available' ? (
                              <span className="inline-block px-2 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-md font-extrabold">
                                {item.storageBayName || 'Galpão'}
                              </span>
                            ) : (
                              <div className="flex flex-col items-end leading-tight">
                                <span className="font-extrabold text-slate-700">
                                  {lines.find(l => l.id === item.currentLineId)?.name || item.consumedIn || 'Consumo'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold">
                                  {formatDateBR(item.consumedAt)}
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  {(coilListTab === 'available' ? filteredAvailableList : filteredConsumedList).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400 text-xs italic font-semibold">
                        Nenhuma bobina corresponde aos filtros selecionados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {(coilListTab === 'available' ? filteredAvailableList : filteredConsumedList).length > 10 && (
                <div className="p-3 bg-slate-50 text-center font-bold text-[10px] text-slate-400 uppercase tracking-wider rounded-xl mt-3 border border-slate-100">
                  Exibindo as primeiras 10 bobina(s) de um total de {(coilListTab === 'available' ? filteredAvailableList : filteredConsumedList).length} correspondentes.
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
};
