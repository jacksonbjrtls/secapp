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
  Activity
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { auth, db } from '../../lib/firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { Logo } from '../ui/Logo';
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
        {name}
      </Link>
    </div>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin, isManager, user } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const defaultNavigation = [
    { id: 'dashboard', name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, show: !!isManager || !!isAdmin },
    { id: 'overview', name: 'Overview', href: '/overview', icon: Activity, show: !!isManager || !!isAdmin },
    { id: 'forklifts', name: 'Empilhadeira', href: '/forklifts', icon: Truck, show: true },
    { id: 'wires', name: 'Arames', href: '/wires', icon: Factory, show: true },
    { id: 'quality', name: 'Qualidade', href: '/quality', icon: ClipboardCheck, show: true },
    { id: 'dds', name: 'DDS Online', href: '/dds', icon: ShieldCheck, show: true },
    { id: 'schedule', name: 'Escala', href: '/schedule', icon: CalendarDays, show: true },
    { id: 'admin', name: 'Gerenciar Usuários', href: '/admin', icon: Users, show: !!isAdmin },
    { id: 'reports', name: 'Relatórios', href: '/reports', icon: FileDown, show: !!isManager },
  ];

  const [navigation, setNavigation] = useState(defaultNavigation);

  useEffect(() => {
    if (profile?.menuOrder && profile.menuOrder.length > 0) {
      const ordered = [...defaultNavigation].sort((a, b) => {
        const indexA = profile.menuOrder!.indexOf(a.id);
        const indexB = profile.menuOrder!.indexOf(b.id);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
      setNavigation(ordered);
    } else {
      setNavigation(defaultNavigation);
    }
  }, [profile?.menuOrder, isAdmin, isManager]);

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
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-8 hidden md:flex items-center justify-between sticky top-0 z-30">
          <h1 className="text-lg font-bold text-slate-800">
            {navigation.find(item => item.href === location.pathname)?.name || (location.pathname === '/profile' ? 'Meu Perfil' : 'Resumo do Sistema')}
          </h1>
          <div className="flex items-center gap-4">
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-slate-50">
          <div className="p-6 md:p-8">
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
    </div>
  );
};

export default Shell;
