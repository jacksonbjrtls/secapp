import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  ShieldCheck, 
  FileDown,
  CalendarDays,
  Truck,
  GripVertical,
  Factory,
  ClipboardCheck,
  Activity,
  ShieldAlert,
  Download,
  Smartphone,
  PlusSquare,
  Share2,
  Sparkles,
  Link2,
  Check,
  PackagePlus,
  ArrowLeftRight,
  Award,
  Clock,
  Gift,
  Wrench
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { auth, db } from '../../lib/firebase';
import { doc, updateDoc, serverTimestamp, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { decryptValue } from '../../lib/crypto';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from '../ui/Logo';
import { PrivacyPolicyModal } from '../ui/PrivacyPolicyModal';
import { QuotaBanner } from './QuotaBanner';
import { fetchUsersSafely, getLocalCachedUsers } from '../../lib/usersCache';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface NavItemProps {
  id: string;
  name: string;
  href: string;
  icon: any;
  show: boolean;
  isActive: boolean;
  onClick: () => void;
}

const SortableNavItem: React.FC<NavItemProps> = ({ id, name, href, icon: Icon, show, isActive, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  if (!show) return null;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as const,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div 
        {...attributes} 
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 p-1 text-slate-300 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity z-10"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      <Link
        to={href}
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 pl-8 rounded-lg text-sm font-medium transition-all",
          isActive
            ? "bg-emerald-50 text-emerald-700 shadow-sm"
            : "text-slate-600 hover:bg-slate-50 hover:text-emerald-600"
        )}
        onClick={onClick}
      >
        <Icon className={cn(
          "w-5 h-5",
          isActive ? "text-emerald-600" : "text-slate-400 group-hover:text-emerald-600"
        )} />
        {name === 'Treinamentos/Certificados' ? (
          <div className="flex flex-col leading-tight text-left">
            <span>Treinamentos</span>
            <span className="text-slate-400 font-normal">Certificados</span>
          </div>
        ) : (
          name
        )}
      </Link>
    </div>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin, isManager, user, isInstallable, installApp } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [activeInstallTab, setActiveInstallTab] = useState<'ios' | 'android' | 'desktop'>('android');
  const [isIOS, setIsIOS] = useState(false);
  const [copied, setCopied] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  // Manage Font Size globally
  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('secapp-font-size');
    return saved ? parseInt(saved, 10) : 100; // 100% is default
  });

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}%`;
    localStorage.setItem('secapp-font-size', fontSize.toString());
  }, [fontSize]);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsAppInstalled(!!isStandalone);

    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);
    const isAndroidDevice = /Android/i.test(navigator.userAgent);

    if (isIOSDevice) {
      setActiveInstallTab('ios');
    } else if (isAndroidDevice) {
      setActiveInstallTab('android');
    } else {
      setActiveInstallTab('desktop');
    }
  }, []);

  // Track swipe gestures to open and close the sidebar menu on mobile devices
  useEffect(() => {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchCurrentX = 0;
    let touchCurrentY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchCurrentX = touchStartX;
      touchCurrentY = touchStartY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      touchCurrentX = e.touches[0].clientX;
      touchCurrentY = e.touches[0].clientY;
    };

    const handleTouchEnd = () => {
      const diffX = touchCurrentX - touchStartX;
      const diffY = touchCurrentY - touchStartY;

      // Ensure it was a clear swipe mostly in the horizontal axis
      if (Math.abs(diffX) > Math.abs(diffY) * 1.8 && Math.abs(diffX) > 60) {
        if (diffX > 0) {
          // Swipe Right: only trigger to open if standard touch gesture starts near the left edge
          if (touchStartX < 100) {
            setIsSidebarOpen(true);
          }
        } else {
          // Swipe Left: triggers to close the sidebar from anywhere on the screen
          setIsSidebarOpen(false);
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  const location = useLocation();
  const navigate = useNavigate();

  const [activeModules, setActiveModules] = useState<Record<string, boolean>>({
    dds: true,
    forklifts: true,
    wires: true,
    quality: true,
    schedule: true,
    operational_routes: true,
    safety_observations: true,
    consumables: true,
    shift_handover: true,
    certificates: true,
    stops_control: true,
    overtime: true,
    vacations: true,
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system_config', 'modules'), (snap) => {
      if (snap.exists()) {
        setActiveModules(snap.data() as Record<string, boolean>);
      }
    }, (error) => {
      console.warn('Could not load system_config/modules:', error);
    });
    return () => unsub();
  }, []);

  // Automatic Birthday Alert Popout on Load
  const [birthdayUsers, setBirthdayUsers] = useState<any[]>([]);
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);

  useEffect(() => {
    if (!profile || profile.status !== 'approved') return;

    const checkBirthdays = async () => {
      try {
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDay = today.getDate();
        const dateKey = `${today.getFullYear()}-${todayMonth}-${todayDay}`;
        const storageKey = `secapp-birthdays-checked-${dateKey}`;

        // Verify if already shown today in this browser session
        if (sessionStorage.getItem(storageKey)) {
          return;
        }

        let allUsers = getLocalCachedUsers();
        if (allUsers.length === 0) {
          allUsers = await fetchUsersSafely();
        }

        const todayBirthdays: any[] = [];

        for (const uData of allUsers) {
          if (uData.birthDate) {
            const parts = uData.birthDate.split('-');
            if (parts.length === 3) {
              const birthMonth = parseInt(parts[1], 10);
              const birthDay = parseInt(parts[2], 10);

              if (birthMonth === todayMonth && birthDay === todayDay) {
                if (uData.email?.toLowerCase().trim() === 'jacksonbjr@gmail.com') {
                  continue;
                }
                todayBirthdays.push({
                  id: uData.uid,
                  displayName: uData.displayName || 'Sem Nome',
                  sectorName: uData.sectorName || '',
                  cargoName: uData.cargoName || '',
                });
              }
            }
          }
        }

        if (todayBirthdays.length > 0) {
          setBirthdayUsers(todayBirthdays);
          setShowBirthdayModal(true);
        }

        sessionStorage.setItem(storageKey, 'true');
      } catch (err) {
        console.warn('Error checking birthdays:', err);
      }
    };

    // Delay checking slightly to allow smooth initial page load
    const timer = setTimeout(() => {
      checkBirthdays();
    }, 1500);

    return () => clearTimeout(timer);
  }, [profile]);

  const [navigation, setNavigation] = useState<any[]>([]);

  useEffect(() => {
    const defaultNav = [
      { id: 'shift_handover', name: 'Passagem de Turno', href: '/shift-handover', icon: ArrowLeftRight, show: activeModules.shift_handover !== false },
      { id: 'dashboard', name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, show: (!!isManager || !!isAdmin) && activeModules.dashboard !== false },
      { id: 'overview', name: 'Overview', href: '/overview', icon: Activity, show: (!!isManager || !!isAdmin) && activeModules.overview !== false },
      { id: 'forklifts', name: 'Empilhadeiras', href: '/forklifts', icon: Truck, show: activeModules.forklifts !== false },
      { id: 'wires', name: 'Arames', href: '/wires', icon: Factory, show: activeModules.wires !== false },
      { id: 'consumables', name: 'Insumos', href: '/consumables', icon: PackagePlus, show: activeModules.consumables !== false },
      { id: 'quality', name: 'Inspeções', href: '/quality', icon: ClipboardCheck, show: activeModules.quality !== false },
      { id: 'dds', name: 'DDS Online', href: '/dds', icon: ShieldCheck, show: activeModules.dds !== false },
      { id: 'operational_routes', name: 'Rota Operacional', href: '/operational-routes', icon: Activity, show: activeModules.operational_routes !== false },
      { id: 'safety_observations', name: 'Obs. Segurança', href: '/safety-observations', icon: ShieldAlert, show: activeModules.safety_observations !== false },
      { id: 'schedule', name: 'Escala', href: '/schedule', icon: CalendarDays, show: activeModules.schedule !== false },
      { id: 'certificates', name: 'Treinamentos/Certificados', href: '/certificates', icon: Award, show: activeModules.certificates !== false },
      { id: 'stops_control', name: 'Controle de Parada', href: '/stops-control', icon: Clock, show: activeModules.stops_control !== false },
      { id: 'maintenance', name: 'Manutenção', href: '/maintenance', icon: Wrench, show: activeModules.maintenance !== false },
      { id: 'overtime', name: 'Justificativa HE', href: '/overtime', icon: Clock, show: activeModules.overtime !== false },
      { id: 'vacations', name: 'Controle de Férias', href: '/vacations', icon: CalendarDays, show: activeModules.vacations !== false },
      { id: 'admin', name: 'Painel Administrativo', href: '/admin', icon: Users, show: !!isAdmin },
      { id: 'reports', name: 'Relatórios', href: '/reports', icon: FileDown, show: !!isManager },
    ];

    // Default alphabetical sorting
    const sortedNav = [...defaultNav].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );

    if (profile?.menuOrder && profile.menuOrder.length > 0) {
      const ordered = [...sortedNav].sort((a, b) => {
        const indexA = profile.menuOrder!.indexOf(a.id);
        const indexB = profile.menuOrder!.indexOf(b.id);
        if (indexA === -1 && indexB === -1) {
          return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
        }
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
      setNavigation(ordered);
    } else {
      setNavigation(sortedNav);
    }
  }, [profile?.menuOrder, isAdmin, isManager, activeModules]);

  const handleSortAlphabetically = async () => {
    const alphabetical = [...navigation].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );
    setNavigation(alphabetical);

    if (user) {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          menuOrder: alphabetical.map((item: any) => item.id),
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Erro ao redefinir ordem alfabética do menu:", error);
      }
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = navigation.findIndex((item) => item.id === active.id);
      const newIndex = navigation.findIndex((item) => item.id === over.id);

      const newOrder = arrayMove(navigation, oldIndex, newIndex);
      setNavigation(newOrder);

      if (user) {
        try {
          await updateDoc(doc(db, 'users', user.uid), {
            menuOrder: newOrder.map((item: any) => item.id),
            updatedAt: serverTimestamp()
          });
        } catch (error) {
          console.error("Erro ao salvar ordem do menu:", error);
        }
      }
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900 font-sans">
      {/* Mobile Header */}
      <div className="md:hidden h-16 bg-white border-b border-slate-200 px-4 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="flex items-center">
          <Logo className="h-8" />
        </Link>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600" id="mobile-menu-toggle">
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || true) && (
          <motion.aside
            initial={{ x: -256 }}
            animate={{ x: isSidebarOpen || window.innerWidth >= 768 ? 0 : -256 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "fixed top-16 bottom-0 left-0 z-40 w-64 bg-white border-r border-slate-200 md:top-0 md:relative md:block",
              !isSidebarOpen && "hidden md:block"
            )}
          >
            <div className="h-full flex flex-col">
              <div className="p-6 hidden md:flex items-center border-b border-slate-200">
                <Link to="/" className="flex items-center">
                  <Logo className="h-10" />
                </Link>
              </div>

              <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                <div className="flex items-center justify-between px-2 pb-1.5 mb-1 border-b border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Menu
                  </span>
                  <button
                    onClick={handleSortAlphabetically}
                    title="Organizar o menu em ordem alfabética (A-Z)"
                    className="text-[10px] font-bold text-slate-500 hover:text-emerald-700 transition-all flex items-center gap-1 bg-slate-50 hover:bg-emerald-50 px-2 py-0.5 rounded-lg border border-slate-200 hover:border-emerald-200 active:scale-95"
                  >
                    <span>A-Z</span>
                    <span className="text-[9px] text-slate-400 font-normal">(Ordenar)</span>
                  </button>
                </div>

                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={navigation.map(i => i.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {navigation.map((item) => (
                      <SortableNavItem
                        key={item.id}
                        id={item.id}
                        name={item.name}
                        href={item.href}
                        icon={item.icon}
                        show={item.show}
                        isActive={location.pathname === item.href}
                        onClick={() => setIsSidebarOpen(false)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </nav>

              <div className="p-4 border-t border-slate-200 shrink-0">
                {/* Font Size Adjuster inside Mobile / General Sidebar */}
                <div className="mb-4 bg-slate-50 border border-slate-200/60 rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <span className="inline-flex items-end font-sans select-none leading-none border border-slate-350 rounded bg-white px-1 py-0.5 text-slate-500">
                        <span className="text-[10px] font-semibold leading-none">a</span>
                        <span className="text-sm font-black leading-none ml-0.5">A</span>
                      </span>
                      Tamanho da Letra
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                      {fontSize}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    <button
                      onClick={() => setFontSize(prev => Math.max(80, prev - 10))}
                      disabled={fontSize <= 80}
                      className="py-1 px-1.5 text-xs font-black rounded-lg bg-white border border-slate-200 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer text-slate-600 hover:text-slate-900"
                      title="Diminuir texto"
                    >
                      A -
                    </button>
                    <button
                      onClick={() => setFontSize(100)}
                      className={cn(
                        "py-1 px-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer",
                        fontSize === 100 
                          ? "bg-emerald-600 text-white font-black" 
                          : "bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                      )}
                      title="Tamanho padrão (100%)"
                    >
                      Padrão
                    </button>
                    <button
                      onClick={() => setFontSize(prev => Math.min(140, prev + 10))}
                      disabled={fontSize >= 140}
                      className="py-1 px-1.5 text-xs font-black rounded-lg bg-white border border-slate-200 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer text-slate-600 hover:text-slate-900"
                      title="Aumentar texto"
                    >
                      A +
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3 px-2 py-2 mb-4">
                  <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-sm overflow-hidden">
                    {profile?.photoURL ? (
                      <img src={profile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      profile?.displayName?.charAt(0) || profile?.email?.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{profile?.displayName || 'Usuário'}</p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">{profile?.role}</p>
                  </div>
                </div>

                <Link
                  to="/profile"
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 mb-2 rounded-lg text-sm font-medium transition-all group",
                    location.pathname === '/profile'
                      ? "bg-emerald-50 text-emerald-700 shadow-sm"
                      : "text-slate-600 hover:bg-slate-50 hover:text-emerald-600"
                  )}
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <Settings className={cn(
                    "w-5 h-5",
                    location.pathname === '/profile' ? "text-emerald-600" : "text-slate-400 group-hover:text-emerald-600"
                  )} />
                  Meu Perfil
                </Link>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm font-bold text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sair
                </button>

                {/* LGPD Privacy Link */}
                <div className="mt-4 pt-4 border-t border-slate-100 text-center">
                  <button
                    type="button"
                    onClick={() => setPrivacyModalOpen(true)}
                    className="text-[11px] font-semibold text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer underline underline-offset-2"
                  >
                    Política de Privacidade (LGPD)
                  </button>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <QuotaBanner />
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 hidden md:flex items-center justify-between sticky top-0 z-30">
          <h1 className="text-lg font-bold text-slate-800">
            {navigation.find(item => item.href === location.pathname)?.name || (location.pathname === '/profile' ? 'Meu Perfil' : 'Resumo do Sistema')}
          </h1>
          <div className="flex items-center gap-4">
            {/* Font Size Adjuster for desktop header */}
            <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200" title="Acessibilidade: Tamanho do Texto">
              <span className="inline-flex items-end font-sans select-none leading-none border border-slate-200 rounded bg-white px-2 py-1 text-slate-500 mr-1 shrink-0">
                <span className="text-[10px] font-semibold leading-none">a</span>
                <span className="text-sm font-black leading-none ml-0.5">A</span>
              </span>
              <button
                onClick={() => setFontSize(prev => Math.max(80, prev - 10))}
                disabled={fontSize <= 80}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-100 active:bg-slate-200 text-slate-600 hover:text-slate-900 transition-all font-black text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Diminuir tamanho da letra"
              >
                A-
              </button>
              <button
                onClick={() => setFontSize(100)}
                className={cn(
                  "h-8 px-2.5 flex items-center justify-center rounded-lg text-xs font-bold transition-all cursor-pointer",
                  fontSize === 100 
                    ? "bg-emerald-600 text-white font-black shadow-sm" 
                    : "bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900"
                )}
                title="Tamanho padrão (100%)"
              >
                Padrão
              </button>
              <button
                onClick={() => setFontSize(prev => Math.min(140, prev + 10))}
                disabled={fontSize >= 140}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:bg-slate-100 active:bg-slate-200 text-slate-600 hover:text-slate-900 transition-all font-black text-sm disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Aumentar tamanho da letra"
              >
                A+
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50">
          <div className="p-3 sm:p-4 md:p-8">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 top-16 bg-black/50 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* PWA Installation Instructions Modal */}
      <AnimatePresence>
        {showInstallModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/65 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] border border-slate-200 shadow-2xl p-6 md:p-8 space-y-5 relative my-8"
            >
              {/* Close Button */}
              <button 
                onClick={() => {
                  setShowInstallModal(false);
                  setCopied(false);
                }}
                className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center pb-2 border-b border-slate-100">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-emerald-600 mb-3 animate-bounce">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black text-slate-850 tracking-tight">Instalar SecApp no Celular</h3>
                <p className="text-xs text-slate-500 font-semibold mt-1">Siga as instruções para ter o app real em tela cheia</p>
              </div>

              {/* QR Code and Direct URL Instructions Box */}
              <div className="bg-amber-50 border border-amber-200/60 rounded-3xl p-4 space-y-2">
                <span className="text-[11px] font-black text-amber-850 uppercase tracking-widest block">⚠️ ATENÇÃO: Se estiver no painel do computador</span>
                <p className="text-[10px] text-slate-600 font-semibold leading-relaxed">
                  Os navegadores bloqueiam a instalação direta de PWAs quando eles estão rodando <strong>dentro de painéis (iframe)</strong>.
                </p>
                <p className="text-[10px] text-slate-600 font-semibold leading-relaxed">
                  Para instalar, escaneie o QR Code abaixo com a câmera do seu celular para abrir o site limpo diretamente no seu navegador móvel (Safari ou Chrome), ou clique no botão para copiar o link e acessá-lo externamente.
                </p>

                <div className="flex flex-col items-center gap-2 pt-3 bg-white/70 rounded-2xl p-3 border border-amber-100/45">
                  <div className="p-1.5 bg-white rounded-xl border border-slate-150 inline-block shadow-inner">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(window.location.href.replace('ais-dev-', 'ais-pre-'))}`}
                      alt="PWA QR Code"
                      className="w-24 h-24 object-contain"
                    />
                  </div>
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Escaneie com a Câmera do seu Celular</span>

                  <button
                    type="button"
                    onClick={() => {
                      const shareUrl = window.location.href.replace('ais-dev-', 'ais-pre-');
                      navigator.clipboard.writeText(shareUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="mt-1 flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 text-[10px] font-bold rounded-xl transition-all border border-slate-200/85 cursor-pointer max-w-full truncate"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.0 h-3.0 text-emerald-600 animate-ping-once mr-0.5" />
                        <span className="text-emerald-700 font-black">Link Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="w-3 h-3 text-slate-500" />
                        <span>Copiar link para enviar ao celular</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1.5 rounded-2xl text-[10px] sm:text-xs font-bold text-slate-600">
                <button
                  type="button"
                  onClick={() => setActiveInstallTab('android')}
                  className={cn(
                    "py-2 rounded-xl text-center cursor-pointer transition-all",
                    activeInstallTab === 'android' ? "bg-white text-emerald-800 shadow-sm" : "hover:text-slate-800 hover:bg-slate-50/50"
                  )}
                >
                  Android
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInstallTab('ios')}
                  className={cn(
                    "py-2 rounded-xl text-center cursor-pointer transition-all",
                    activeInstallTab === 'ios' ? "bg-white text-emerald-800 shadow-sm" : "hover:text-slate-800 hover:bg-slate-50/50"
                  )}
                >
                  iPhone (iOS)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInstallTab('desktop')}
                  className={cn(
                    "py-2 rounded-xl text-center cursor-pointer transition-all",
                    activeInstallTab === 'desktop' ? "bg-white text-emerald-800 shadow-sm" : "hover:text-slate-800 hover:bg-slate-50/50"
                  )}
                >
                  Computador
                </button>
              </div>

              {/* Tab Content */}
              <div className="space-y-4 pt-1 text-slate-700 text-sm">
                {activeInstallTab === 'android' && (
                  <div className="space-y-3 font-semibold text-slate-600">
                    <p className="text-[11px] text-slate-500 italic pb-0.5">Para navegadores como Google Chrome, Samsung Internet ou Opera:</p>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</div>
                      <p className="text-xs leading-relaxed text-slate-600">Pressione as configurações ou menu do navegador (ícone <span className="font-bold underline text-slate-850 text-sm inline-block px-1 bg-slate-150 rounded">⋮</span> ou de três linhas).</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</div>
                      <p className="text-xs leading-relaxed text-slate-600">Busque e clique na opção <span className="font-bold text-emerald-700">Instalar aplicativo</span> ou <span className="font-bold text-slate-800">"Adicionar à tela inicial"</span>.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">3</div>
                      <p className="text-xs leading-relaxed text-slate-600">Confirme a confirmação na janela. O SecApp será adicionado à sua tela de início como um app real!</p>
                    </div>
                  </div>
                )}

                {activeInstallTab === 'ios' && (
                  <div className="space-y-3 font-semibold text-slate-600">
                    <p className="text-[11px] text-slate-500 italic pb-0.5">Para o navegador padrão Safari (iOS):</p>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</div>
                      <p className="text-xs leading-relaxed text-slate-600">Abra este site utilizando o navegador oficial <span className="font-bold text-slate-800">Safari</span> do iPhone.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</div>
                      <p className="text-xs leading-relaxed text-slate-600">Toque no botão central de elevar/compartilhar <span className="font-bold text-emerald-750 text-xs inline-flex items-center gap-1 bg-slate-100 rounded px-1.5 py-0.5 border border-slate-250"><Share2 className="w-3.5 h-3.5 text-emerald-600" /> Compartilhar</span> no menu do Safari.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">3</div>
                      <p className="text-xs leading-relaxed text-slate-600">Role a gaveta um pouco para baixo e toque em <span className="font-bold text-emerald-750 text-xs inline-flex items-center gap-1 bg-slate-100 rounded px-1.5 py-0.5 border border-slate-250"><PlusSquare className="w-3.5 h-3.5 text-emerald-600" /> Adicionar à Tela de Início</span>.</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">4</div>
                      <p className="text-xs leading-relaxed text-slate-600">Confirme tocando em <span className="font-black text-slate-800">Adicionar</span> no canto superior direito.</p>
                    </div>
                  </div>
                )}

                {activeInstallTab === 'desktop' && (
                  <div className="space-y-3 font-semibold text-slate-600">
                    <p className="text-[11px] text-slate-500 italic pb-0.5">Para computadores (Google Chrome / Edge):</p>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</div>
                      <p className="text-xs leading-relaxed text-slate-600">Dobre sua atenção para a barra de endereços (no topo superior direito, ao lado da estrela favoritos).</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</div>
                      <p className="text-xs leading-relaxed text-slate-600">Você verá um ícone parecido com um monitor de computador ou uma setinha para baixo (<Download className="inline w-3.5 h-3.5 text-emerald-600 animate-pulse" />).</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">3</div>
                      <p className="text-xs leading-relaxed text-slate-600">Dê um único clique nele e selecione <span className="font-bold text-emerald-700 text-xs">Instalar</span> para ter um atalho separado na sua área de trabalho sem precisar digitar a URL!</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowInstallModal(false)}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-2xl transition-all uppercase tracking-wider cursor-pointer text-center"
                >
                  Entendi, obrigado!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Birthday Celebration Modal */}
      <AnimatePresence>
        {showBirthdayModal && birthdayUsers.length > 0 && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="bg-gradient-to-br from-amber-50 via-white to-rose-50 w-full max-w-md rounded-[2.5rem] border-2 border-amber-200/50 shadow-2xl p-6 md:p-8 space-y-6 relative text-center overflow-hidden animate-fade-in"
            >
              {/* Confetti Background elements */}
              <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-pink-500 via-purple-500 via-cyan-500 via-green-500 to-amber-500" />
              
              <div className="absolute -top-10 -left-10 w-32 h-32 bg-amber-100 rounded-full mix-blend-multiply filter blur-xl opacity-75 animate-blob" />
              <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-rose-100 rounded-full mix-blend-multiply filter blur-xl opacity-75 animate-blob animation-delay-2000" />

              {/* Close button */}
              <button
                onClick={() => setShowBirthdayModal(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all cursor-pointer z-10"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="relative z-10 space-y-4">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-amber-400 to-rose-400 rounded-3xl text-white shadow-lg shadow-rose-100 animate-bounce">
                  <Gift className="w-8 h-8" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-2xl font-black text-slate-850 tracking-tight flex items-center justify-center gap-2">
                    <Sparkles className="w-6 h-6 text-amber-500 fill-amber-300 animate-pulse" />
                    Parabéns Hoje!
                    <Sparkles className="w-6 h-6 text-amber-500 fill-amber-300 animate-pulse" />
                  </h3>
                  <p className="text-sm font-bold text-rose-600">
                    {birthdayUsers.length === 1 
                      ? 'Temos um aniversariante do dia na nossa equipe!' 
                      : 'Temos aniversariantes do dia na nossa equipe!'}
                  </p>
                </div>

                {/* Celebrants List */}
                <div className="py-2 space-y-3 max-h-60 overflow-y-auto">
                  {birthdayUsers.map((u, idx) => (
                    <div 
                      key={`bday-${u.id || u.uid || 'user'}-${idx}`} 
                      className="p-4 bg-white/85 border border-amber-200/40 rounded-2xl shadow-sm hover:scale-[1.02] transition-transform duration-300"
                    >
                      <h4 className="text-lg font-black text-slate-800">{u.displayName}</h4>
                      {(u.cargoName || u.sectorName) && (
                        <p className="text-xs text-slate-500 font-bold mt-1">
                          {u.cargoName || 'Colaborador'} 
                          {u.sectorName && ` • ${u.sectorName}`}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                <p className="text-xs text-slate-500 leading-relaxed font-bold">
                  "Desejamos muitos anos de vida, saúde, paz e que todos os seus sonhos se realizem! Que o seu dia seja repleto de felicidades e comemorações!" 🎉🎂🎈
                </p>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowBirthdayModal(false)}
                    className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-extrabold text-sm rounded-2xl shadow-md hover:shadow-lg transition-all cursor-pointer uppercase tracking-wider text-center"
                  >
                    Celebrar e Continuar
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal isOpen={privacyModalOpen} onClose={() => setPrivacyModalOpen(false)} />
    </div>
  );
};

export default Shell;
