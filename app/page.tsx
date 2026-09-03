'use client';

import {
  type CSSProperties,
  type ChangeEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDownToLine,
  BookOpenText,
  CalendarRange,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Download,
  FileUp,
  FileText,
  LoaderCircle,
  LogOut,
  Moon,
  Plus,
  Sparkles,
  Sunrise,
  Target,
  Trash2,
  Trophy,
  WifiOff,
} from 'lucide-react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';

import { PwaRegister } from '@/components/pwa-register';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import {
  DURATION_STORAGE_KEY,
  TIMELINE_ROW_HEIGHT,
  dateFromKey,
  dateKey,
  entryColor,
  formatDay,
  formatDuration,
  formatHour,
  formatTime,
  inputToMinute,
  isTimelineEntry,
  isDailyReflection,
  loadGuestEntries,
  loadGuestReflections,
  minuteToInput,
  minutesNow,
  saveGuestEntries,
  saveGuestReflections,
  shiftDate,
  snapMinute,
  parseNaturalEntry,
  reflectionFromCloudRecord,
  reflectionRecordId,
  toCloudReflectionRecord,
  type DailyReflection,
  type NaturalEntryDraft,
  type TimelineEntry,
} from '@/lib/daymark';
import {
  firebaseConfigured,
  getFirebaseServices,
  type FirebaseServices,
} from '@/lib/firebase';
import { cn } from '@/lib/utils';

type EditorMode = 'quick' | 'detail' | 'edit';
type DayMarkerKind = 'wake' | 'sleep';
type SyncStatus = 'local' | 'saved' | 'syncing' | 'offline' | 'error';
type TimelineDrag = {
  pointerId: number;
  anchorMinute: number;
  startY: number;
  moved: boolean;
};

const hours = Array.from({ length: 24 }, (_, index) => index);
const SHORT_ENTRY_THRESHOLD = 30;
const SHORT_ENTRY_MIN_HEIGHT = 15;
const ENTRY_TEXT_MIN_HEIGHT = 24;

export default function Home() {
  const [selectedDate, setSelectedDate] = useState('');
  const [guestEntries, setGuestEntries] = useState<TimelineEntry[]>([]);
  const [cloudEntries, setCloudEntries] = useState<TimelineEntry[]>([]);
  const [guestReflections, setGuestReflections] = useState<DailyReflection[]>(
    [],
  );
  const [cloudReflections, setCloudReflections] = useState<DailyReflection[]>(
    [],
  );
  const [guestLoaded, setGuestLoaded] = useState(false);
  const [services, setServices] = useState<FirebaseServices | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(firebaseConfigured);
  const [isOnline, setIsOnline] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('local');
  const [clockMinute, setClockMinute] = useState(0);

  const [entryOpen, setEntryOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('quick');
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryDetails, setEntryDetails] = useState('');
  const [showEntryDetails, setShowEntryDetails] = useState(false);
  const [focusEntryDetails, setFocusEntryDetails] = useState(false);
  const [entryStart, setEntryStart] = useState('09:00');
  const [entryEnd, setEntryEnd] = useState('09:30');
  const [selectedDuration, setSelectedDuration] = useState(30);
  const [customDuration, setCustomDuration] = useState(false);
  const [entryError, setEntryError] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);
  const [overflowingEntryIds, setOverflowingEntryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [weeklyReviewOpen, setWeeklyReviewOpen] = useState(false);
  const [dayMarkersOpen, setDayMarkersOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hoverMinute, setHoverMinute] = useState<number | null>(null);
  const [dragRange, setDragRange] = useState<{
    startMinute: number;
    endMinute: number;
  } | null>(null);

  const [accountOpen, setAccountOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toastActionEntry, setToastActionEntry] =
    useState<TimelineEntry | null>(null);

  const nowMarkerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineDragRef = useRef<TimelineDrag | null>(null);
  const suppressTimelineClickRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineEntryRefs = useRef(new Map<string, HTMLButtonElement>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const today = dateKey();
  const activeEntries = user ? cloudEntries : guestEntries;
  const activeReflections = user ? cloudReflections : guestReflections;
  const selectedEntries = useMemo(
    () =>
      activeEntries
        .filter((entry) => entry.date === selectedDate && !entry.deletedAt)
        .sort((a, b) => a.startMinute - b.startMinute),
    [activeEntries, selectedDate],
  );
  const selectedReflection = useMemo(
    () => activeReflections.find((item) => item.date === selectedDate) ?? null,
    [activeReflections, selectedDate],
  );

  useEffect(() => {
    let cancelled = false;
    let frame = 0;

    const measureEntries = () => {
      if (cancelled) return;

      const next = new Set<string>();
      selectedEntries.forEach((entry) => {
        const element = timelineEntryRefs.current.get(entry.id);
        const summary = element?.querySelector<HTMLElement>(
          '.timeline-entry-summary',
        );

        if (summary && summary.scrollWidth > summary.clientWidth + 1) {
          next.add(entry.id);
        }
      });

      setOverflowingEntryIds((current) => {
        if (
          current.size === next.size &&
          [...current].every((id) => next.has(id))
        ) {
          return current;
        }
        return next;
      });
    };

    const scheduleMeasurement = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measureEntries);
    };

    scheduleMeasurement();
    window.addEventListener('resize', scheduleMeasurement);
    void document.fonts?.ready.then(scheduleMeasurement);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', scheduleMeasurement);
    };
  }, [selectedEntries]);
  const isToday = selectedDate === today;

  useEffect(() => {
    const openedOn = dateKey();
    let reloadingForNewDay = false;

    const refreshClockAndDay = () => {
      const currentDay = dateKey();
      if (!reloadingForNewDay && currentDay !== openedOn) {
        reloadingForNewDay = true;
        window.location.reload();
        return;
      }
      setClockMinute(minutesNow());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshClockAndDay();
    };

    setSelectedDate(openedOn);
    setGuestEntries(loadGuestEntries());
    setGuestReflections(loadGuestReflections());
    setGuestLoaded(true);
    setIsOnline(navigator.onLine);
    refreshClockAndDay();
    const clock = setInterval(refreshClockAndDay, 30_000);
    const rememberedDuration = Number(
      window.localStorage.getItem(DURATION_STORAGE_KEY),
    );
    if (
      Number.isFinite(rememberedDuration) &&
      rememberedDuration >= 5 &&
      rememberedDuration <= 12 * 60
    )
      setSelectedDuration(rememberedDuration);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', refreshClockAndDay);
    window.addEventListener('pageshow', refreshClockAndDay);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', refreshClockAndDay);
      window.removeEventListener('pageshow', refreshClockAndDay);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    if (!firebaseConfigured) {
      setAuthChecking(false);
      return;
    }
    const nextServices = getFirebaseServices();
    if (!nextServices) {
      setAuthChecking(false);
      return;
    }
    setServices(nextServices);
    return onAuthStateChanged(nextServices.auth, (nextUser) => {
      setUser(nextUser);
      setAuthChecking(false);
      setSyncStatus(
        nextUser ? (navigator.onLine ? 'syncing' : 'offline') : 'local',
      );
    });
  }, []);

  useEffect(() => {
    if (!user || !services) {
      setCloudEntries([]);
      setCloudReflections([]);
      return;
    }

    const entriesRef = collection(services.db, 'users', user.uid, 'entries');
    return onSnapshot(
      entriesRef,
      { includeMetadataChanges: true },
      (snapshot) => {
        const records = snapshot.docs.map((entryDoc) => entryDoc.data());
        const nextEntries = records.filter(isTimelineEntry);
        const nextReflections = records
          .map(reflectionFromCloudRecord)
          .filter((reflection): reflection is DailyReflection =>
            Boolean(reflection),
          );
        setCloudEntries(nextEntries);
        setCloudReflections(nextReflections);
        const hasPendingWrites = snapshot.docs.some(
          (entryDoc) => entryDoc.metadata.hasPendingWrites,
        );
        setSyncStatus(
          !navigator.onLine
            ? 'offline'
            : hasPendingWrites
              ? 'syncing'
              : 'saved',
        );
      },
      () => setSyncStatus('error'),
    );
  }, [services, user]);

  useEffect(() => {
    if (
      user &&
      guestLoaded &&
      (guestEntries.some((entry) => !entry.deletedAt) ||
        guestReflections.some(hasReflectionContent))
    ) {
      setMigrationOpen(true);
    }
  }, [guestEntries, guestLoaded, guestReflections, user]);

  useEffect(() => {
    if (!user) return;
    setSyncStatus((current) =>
      !isOnline ? 'offline' : current === 'offline' ? 'syncing' : current,
    );
  }, [isOnline, user]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const totalMinutes = useMemo(
    () =>
      selectedEntries.reduce(
        (total, entry) => total + entry.endMinute - entry.startMinute,
        0,
      ),
    [selectedEntries],
  );
  const longestMinutes = useMemo(
    () =>
      selectedEntries.reduce(
        (longest, entry) =>
          Math.max(longest, entry.endMinute - entry.startMinute),
        0,
      ),
    [selectedEntries],
  );
  const gapStartMinute =
    typeof selectedReflection?.wakeMinute === 'number'
      ? Math.max(0, Math.min(24 * 60, selectedReflection.wakeMinute))
      : 6 * 60;
  const timelineGaps = useMemo(
    () =>
      findTimelineGaps(
        selectedEntries,
        gapStartMinute,
        isToday ? clockMinute : 24 * 60,
      ),
    [clockMinute, gapStartMinute, isToday, selectedEntries],
  );
  const suggestedGap = timelineGaps[0] ?? null;

  const editorRange = useMemo(
    () => ({
      startMinute: inputToMinute(entryStart),
      endMinute: inputToMinute(entryEnd),
    }),
    [entryEnd, entryStart],
  );

  const naturalDraft = useMemo(
    () =>
      editorMode === 'edit'
        ? null
        : parseNaturalEntry(entryTitle, {
            referenceMinute: editorRange.endMinute,
            startMinute: editorRange.startMinute,
            endMinute: editorRange.endMinute,
            anchor: editorMode === 'quick' ? 'before' : 'after',
          }),
    [editorMode, editorRange, entryTitle],
  );
  const markerSuggestion = useMemo(
    () => (editorMode === 'edit' ? null : dayMarkerIntent(entryTitle)),
    [editorMode, entryTitle],
  );

  function notify(message: string, actionEntry: TimelineEntry | null = null) {
    setToast(message);
    setToastActionEntry(actionEntry);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => {
        setToast('');
        setToastActionEntry(null);
      },
      actionEntry ? 6000 : 3200,
    );
  }

  function openQuickAdd() {
    const endMinute = Math.max(5, snapMinute(minutesNow(), 5));
    setSelectedDate(today);
    setEditorMode('quick');
    setEditingEntry(null);
    setEntryTitle('');
    setEntryDetails('');
    setShowEntryDetails(false);
    setFocusEntryDetails(false);
    setEntryStart(minuteToInput(Math.max(0, endMinute - selectedDuration)));
    setEntryEnd(minuteToInput(endMinute));
    setCustomDuration(false);
    setEntryError('');
    setEntryOpen(true);
  }

  function openDetailedAdd(startMinute: number) {
    const safeStart = Math.min(startMinute, 24 * 60 - 15);
    setEditorMode('detail');
    setEditingEntry(null);
    setEntryTitle('');
    setEntryDetails('');
    setShowEntryDetails(false);
    setFocusEntryDetails(false);
    setEntryStart(minuteToInput(safeStart));
    setEntryEnd(
      minuteToInput(Math.min(24 * 60 - 1, safeStart + selectedDuration)),
    );
    setCustomDuration(false);
    setEntryError('');
    setEntryOpen(true);
  }

  function openGapAdd(startMinute: number, endMinute: number) {
    const safeEnd = Math.min(24 * 60 - 1, endMinute);
    setEditorMode('detail');
    setEditingEntry(null);
    setEntryTitle('');
    setEntryDetails('');
    setShowEntryDetails(false);
    setFocusEntryDetails(false);
    setEntryStart(minuteToInput(startMinute));
    setEntryEnd(minuteToInput(safeEnd));
    setSelectedDuration(safeEnd - startMinute);
    setCustomDuration(false);
    setEntryError('');
    setEntryOpen(true);
  }

  function openEdit(entry: TimelineEntry, revealDetails = false) {
    setExpandedEntryId(null);
    setEditorMode('edit');
    setEditingEntry(entry);
    setEntryTitle(entry.title);
    setEntryDetails(entry.details ?? '');
    setShowEntryDetails(revealDetails || Boolean(entry.details));
    setFocusEntryDetails(revealDetails);
    setEntryStart(minuteToInput(entry.startMinute));
    setEntryEnd(minuteToInput(entry.endMinute));
    setSelectedDuration(entry.endMinute - entry.startMinute);
    setCustomDuration(false);
    setEntryError('');
    setEntryOpen(true);
  }

  function setEditorDuration(duration: number) {
    const currentStart = editorRange.startMinute;
    const currentEnd = editorRange.endMinute;
    const maxDuration =
      editorMode === 'quick'
        ? Math.max(5, currentEnd)
        : Math.max(5, 24 * 60 - 1 - currentStart);
    const safeDuration = Math.max(
      5,
      Math.min(maxDuration, Math.round(duration)),
    );

    setSelectedDuration(safeDuration);
    if (editorMode === 'quick') {
      setEntryStart(minuteToInput(Math.max(0, currentEnd - safeDuration)));
    } else {
      setEntryEnd(
        minuteToInput(Math.min(24 * 60 - 1, currentStart + safeDuration)),
      );
    }
    setEntryError('');
  }

  function handleEntryClick(entry: TimelineEntry) {
    if (!window.matchMedia('(max-width: 639px)').matches) {
      openEdit(entry);
      return;
    }

    if (expandedEntryId !== entry.id) {
      setExpandedEntryId(entry.id);
      return;
    }

    openEdit(entry);
  }

  function handleTimelineClick(
    event: MouseEvent<HTMLButtonElement>,
    hour: number,
  ) {
    if (suppressTimelineClickRef.current) {
      suppressTimelineClickRef.current = false;
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const relative = Math.max(
      0,
      Math.min(bounds.height - 1, event.clientY - bounds.top),
    );
    const quarter = Math.floor(relative / (bounds.height / 4));
    openDetailedAdd(hour * 60 + quarter * 15);
  }

  function timelineMinuteFromPointer(event: ReactPointerEvent<HTMLElement>) {
    const bounds = timelineRef.current?.getBoundingClientRect();
    if (!bounds) return 0;
    const relative = Math.max(
      0,
      Math.min(bounds.height - 1, event.clientY - bounds.top),
    );
    return Math.min(24 * 60 - 5, snapMinute(relative, 5));
  }

  function supportsTimelinePrecision(event: ReactPointerEvent<HTMLElement>) {
    return (
      event.pointerType !== 'touch' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches
    );
  }

  function isTimelineEntryTarget(event: ReactPointerEvent<HTMLElement>) {
    return Boolean(
      (event.target as HTMLElement).closest('.timeline-entry, .day-boundary'),
    );
  }

  function rangeFromDrag(anchorMinute: number, currentMinute: number) {
    return currentMinute >= anchorMinute
      ? {
          startMinute: anchorMinute,
          endMinute: Math.min(
            24 * 60 - 1,
            Math.max(anchorMinute + 5, currentMinute),
          ),
        }
      : { startMinute: currentMinute, endMinute: anchorMinute };
  }

  function handleTimelinePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      !supportsTimelinePrecision(event) ||
      isTimelineEntryTarget(event)
    ) {
      return;
    }
    const anchorMinute = Math.min(
      24 * 60 - 10,
      timelineMinuteFromPointer(event),
    );
    timelineDragRef.current = {
      pointerId: event.pointerId,
      anchorMinute,
      startY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleTimelinePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!supportsTimelinePrecision(event)) return;
    const minute = timelineMinuteFromPointer(event);
    const drag = timelineDragRef.current;

    if (!drag) {
      setHoverMinute(isTimelineEntryTarget(event) ? null : minute);
      return;
    }
    if (drag.pointerId !== event.pointerId) return;

    if (!drag.moved && Math.abs(event.clientY - drag.startY) >= 4) {
      drag.moved = true;
    }
    if (drag.moved) {
      event.preventDefault();
      setHoverMinute(null);
      setDragRange(rangeFromDrag(drag.anchorMinute, minute));
    }
  }

  function handleTimelinePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = timelineDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    timelineDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!drag.moved) {
      setDragRange(null);
      suppressTimelineClickRef.current = true;
      window.setTimeout(() => {
        suppressTimelineClickRef.current = false;
      }, 0);
      openDetailedAdd(drag.anchorMinute);
      return;
    }

    event.preventDefault();
    const range = rangeFromDrag(
      drag.anchorMinute,
      timelineMinuteFromPointer(event),
    );
    setDragRange(null);
    suppressTimelineClickRef.current = true;
    window.setTimeout(() => {
      suppressTimelineClickRef.current = false;
    }, 0);
    openGapAdd(range.startMinute, range.endMinute);
  }

  function handleTimelinePointerCancel(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (timelineDragRef.current?.pointerId !== event.pointerId) return;
    timelineDragRef.current = null;
    setDragRange(null);
    setHoverMinute(null);
  }

  async function persistEntry(entry: TimelineEntry) {
    if (user && services) {
      setCloudEntries((current) => mergeEntry(current, entry));
      setSyncStatus(isOnline ? 'syncing' : 'offline');
      try {
        await setDoc(
          doc(services.db, 'users', user.uid, 'entries', entry.id),
          entry,
        );
      } catch {
        setSyncStatus('error');
        notify('Saved offline. Daymark will retry when you reconnect.');
      }
      return;
    }

    setGuestEntries((current) => {
      const next = mergeEntry(current, entry).filter((item) => !item.deletedAt);
      saveGuestEntries(next);
      return next;
    });
  }

  async function persistReflection(reflection: DailyReflection) {
    if (user && services) {
      setCloudReflections((current) => mergeReflection(current, reflection));
      setSyncStatus(isOnline ? 'syncing' : 'offline');
      try {
        await setDoc(
          doc(
            services.db,
            'users',
            user.uid,
            'entries',
            reflectionRecordId(reflection.date),
          ),
          toCloudReflectionRecord(reflection),
        );
      } catch {
        setSyncStatus('error');
        notify('Saved offline. Daymark will retry when you reconnect.');
      }
      return;
    }

    setGuestReflections((current) => {
      const next = mergeReflection(current, reflection);
      saveGuestReflections(next);
      return next;
    });
  }

  async function saveSelectedReflection(fields: {
    biggestWin: string;
    tomorrowFocus: string;
  }) {
    await persistReflection({
      ...selectedReflection,
      date: selectedDate || today,
      biggestWin: fields.biggestWin.trim(),
      tomorrowFocus: fields.tomorrowFocus.trim(),
      updatedAt: new Date().toISOString(),
    });
  }

  async function saveSelectedMarkers(fields: {
    wakeMinute: number | null;
    sleepMinute: number | null;
  }) {
    await persistReflection({
      biggestWin: '',
      tomorrowFocus: '',
      ...selectedReflection,
      date: selectedDate || today,
      wakeMinute: fields.wakeMinute,
      sleepMinute: fields.sleepMinute,
      updatedAt: new Date().toISOString(),
    });
  }

  async function setMarkerFromEntry(kind: DayMarkerKind) {
    const rawMinute =
      editorMode === 'quick' ? editorRange.endMinute : editorRange.startMinute;
    if (!Number.isFinite(rawMinute)) {
      setEntryError('Choose a valid time for the day marker.');
      return;
    }

    const markerMinute = Math.max(0, Math.min(24 * 60 - 1, rawMinute));
    let wakeMinute = selectedReflection?.wakeMinute ?? null;
    let sleepMinute = selectedReflection?.sleepMinute ?? null;

    if (kind === 'wake') {
      wakeMinute = markerMinute;
      if (
        sleepMinute != null &&
        sleepMinute < 24 * 60 &&
        sleepMinute <= wakeMinute
      ) {
        sleepMinute += 24 * 60;
      }
    } else {
      sleepMinute =
        wakeMinute != null && markerMinute <= wakeMinute
          ? markerMinute + 24 * 60
          : markerMinute;
    }

    await saveSelectedMarkers({ wakeMinute, sleepMinute });
    setEntryOpen(false);
    setEntryTitle('');
    setEntryDetails('');
    setShowEntryDetails(false);
    setFocusEntryDetails(false);
    setEditingEntry(null);
    notify(
      kind === 'wake'
        ? `Day start set to ${formatBoundaryTime(markerMinute)}.`
        : `Sleep set to ${formatBoundaryTime(sleepMinute ?? markerMinute)}.`,
    );
  }

  async function handleEntrySubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed =
      editorMode === 'edit'
        ? null
        : parseNaturalEntry(entryTitle, {
            referenceMinute: editorRange.endMinute,
            startMinute: editorRange.startMinute,
            endMinute: editorRange.endMinute,
            anchor: editorMode === 'quick' ? 'before' : 'after',
          });
    const title = parsed?.title ?? entryTitle.trim();
    const range = parsed ?? editorRange;
    if (!title) {
      setEntryError('Write a short note about what you did.');
      return;
    }
    if (range.endMinute <= range.startMinute) {
      setEntryError('The end time needs to be after the start time.');
      return;
    }

    const timestamp = new Date().toISOString();
    const id = editingEntry?.id ?? makeId();
    const details = entryDetails.trim();
    const entry: TimelineEntry = {
      id,
      title,
      ...(details ? { details } : {}),
      date: selectedDate || today,
      startMinute: range.startMinute,
      endMinute: range.endMinute,
      color: editingEntry?.color ?? entryColor(id),
      createdAt: editingEntry?.createdAt ?? timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };

    await persistEntry(entry);
    setSelectedDuration(range.endMinute - range.startMinute);
    window.localStorage.setItem(
      DURATION_STORAGE_KEY,
      String(range.endMinute - range.startMinute),
    );
    setEntryOpen(false);
    setEntryTitle('');
    setEntryDetails('');
    setShowEntryDetails(false);
    setFocusEntryDetails(false);
    setEditingEntry(null);
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1100);
    notify(
      editingEntry ? 'Entry updated.' : 'Added to your timeline.',
      editingEntry ? null : entry,
    );
  }

  async function deleteEditingEntry() {
    if (!editingEntry) return;
    if (user && services) {
      const deletedEntry = {
        ...editingEntry,
        deletedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setCloudEntries((current) => mergeEntry(current, deletedEntry));
      await setDoc(
        doc(services.db, 'users', user.uid, 'entries', editingEntry.id),
        deletedEntry,
      );
    } else {
      setGuestEntries((current) => {
        const next = current.filter((entry) => entry.id !== editingEntry.id);
        saveGuestEntries(next);
        return next;
      });
    }
    setEntryOpen(false);
    setEditingEntry(null);
    setEntryTitle('');
    setEntryDetails('');
    notify('Entry deleted.');
  }

  async function duplicateEditingEntry() {
    if (!editingEntry) return;
    const timestamp = new Date().toISOString();
    const id = makeId();
    await persistEntry({
      ...editingEntry,
      id,
      title: `${editingEntry.title} (copy)`,
      color: entryColor(id),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    });
    setEntryOpen(false);
    setEntryTitle('');
    setEntryDetails('');
    notify('Entry duplicated.');
  }

  async function handleAuth(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!services) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      if (authMode === 'signin') {
        await signInWithEmailAndPassword(services.auth, email, password);
      } else {
        await createUserWithEmailAndPassword(services.auth, email, password);
      }
      setPassword('');
      setAccountOpen(false);
      notify(
        authMode === 'signin'
          ? 'Signed in. Your timeline is syncing.'
          : 'Account created. Welcome to Daymark.',
      );
    } catch (error) {
      setAuthError(readableAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    if (!services) return;
    setAuthBusy(true);
    setAuthError('');
    try {
      await signInWithPopup(services.auth, new GoogleAuthProvider());
      setAccountOpen(false);
      notify('Signed in with Google. Your timeline is syncing.');
    } catch (error) {
      setAuthError(readableAuthError(error));
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleResetPassword() {
    if (!services || !email) {
      setAuthError('Enter your email first, then choose reset password.');
      return;
    }
    try {
      await sendPasswordResetEmail(services.auth, email);
      notify('Password reset email sent.');
    } catch (error) {
      setAuthError(readableAuthError(error));
    }
  }

  async function handleSignOut() {
    if (!services) return;
    await signOut(services.auth);
    setAccountOpen(false);
    notify('Signed out. Device-only mode is active.');
  }

  async function migrateGuestEntries() {
    if (!services || !user) return;
    const entries = guestEntries.filter((entry) => !entry.deletedAt);
    const reflections = guestReflections.filter(hasReflectionContent);
    setSyncStatus('syncing');
    try {
      for (let index = 0; index < entries.length; index += 450) {
        const batch = writeBatch(services.db);
        entries.slice(index, index + 450).forEach((entry) => {
          batch.set(
            doc(services.db, 'users', user.uid, 'entries', entry.id),
            entry,
          );
        });
        await batch.commit();
      }
      for (let index = 0; index < reflections.length; index += 450) {
        const batch = writeBatch(services.db);
        reflections.slice(index, index + 450).forEach((reflection) => {
          batch.set(
            doc(
              services.db,
              'users',
              user.uid,
              'entries',
              reflectionRecordId(reflection.date),
            ),
            toCloudReflectionRecord(reflection),
          );
        });
        await batch.commit();
      }
      setGuestEntries([]);
      saveGuestEntries([]);
      setGuestReflections([]);
      saveGuestReflections([]);
      setMigrationOpen(false);
      const recordCount = entries.length + reflections.length;
      notify(
        `${recordCount} ${recordCount === 1 ? 'record' : 'records'} moved into your account.`,
      );
    } catch {
      setSyncStatus('error');
      notify(
        'Those entries are still safe on this device. Try moving them again when online.',
      );
    }
  }

  async function exportBackup() {
    let entries = guestEntries.filter((entry) => !entry.deletedAt);
    let reflections = guestReflections;
    if (user && services) {
      const snapshot = await getDocs(
        collection(services.db, 'users', user.uid, 'entries'),
      );
      const records = snapshot.docs.map((item) => item.data());
      entries = records
        .filter(isTimelineEntry)
        .filter((entry) => !entry.deletedAt);
      reflections = records
        .map(reflectionFromCloudRecord)
        .filter((reflection): reflection is DailyReflection =>
          Boolean(reflection),
        );
    }
    const payload = JSON.stringify(
      {
        app: 'daymark',
        version: 2,
        exportedAt: new Date().toISOString(),
        entries,
        reflections,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([payload], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `daymark-backup-${dateKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify(
      `Exported ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}.`,
    );
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = (Array.isArray(parsed) ? parsed : parsed.entries).filter(
        isTimelineEntry,
      ) as TimelineEntry[];
      const importedReflections = (
        Array.isArray(parsed) ? [] : (parsed.reflections ?? [])
      ).filter(isDailyReflection) as DailyReflection[];
      if (user && services) {
        for (let index = 0; index < imported.length; index += 450) {
          const batch = writeBatch(services.db);
          imported.slice(index, index + 450).forEach((entry) => {
            batch.set(
              doc(services.db, 'users', user.uid, 'entries', entry.id),
              entry,
            );
          });
          await batch.commit();
        }
        for (let index = 0; index < importedReflections.length; index += 450) {
          const batch = writeBatch(services.db);
          importedReflections
            .slice(index, index + 450)
            .forEach((reflection) => {
              batch.set(
                doc(
                  services.db,
                  'users',
                  user.uid,
                  'entries',
                  reflectionRecordId(reflection.date),
                ),
                toCloudReflectionRecord(reflection),
              );
            });
          await batch.commit();
        }
      } else {
        setGuestEntries((current) => {
          const next = imported.reduce(
            (all, entry) => mergeEntry(all, entry),
            current,
          );
          saveGuestEntries(next);
          return next;
        });
        setGuestReflections((current) => {
          const next = importedReflections.reduce(
            (all, reflection) => mergeReflection(all, reflection),
            current,
          );
          saveGuestReflections(next);
          return next;
        });
      }
      const importedCount = imported.length + importedReflections.length;
      notify(
        `Imported ${importedCount} ${importedCount === 1 ? 'record' : 'records'}.`,
      );
      setAccountOpen(false);
    } catch {
      notify('That backup could not be read. No entries were changed.');
    }
  }

  function jumpToNow() {
    if (!isToday) setSelectedDate(today);
    requestAnimationFrame(() =>
      nowMarkerRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      }),
    );
  }

  const currentMinute = clockMinute;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PwaRegister />
      <header className="sticky top-0 z-30 border-b-2 border-ink bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-[72px] max-w-[1240px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            className="flex items-center gap-2.5"
            onClick={() => window.location.reload()}
            aria-label="Reload Daymark"
            title="Reload Daymark"
          >
            <span className="daymark-mark grid size-8 place-items-center border-2 border-ink bg-sun text-sm font-black shadow-[3px_3px_0_#111]">
              D
            </span>
            <span className="text-lg font-black tracking-[-0.04em]">
              daymark
            </span>
          </button>

          <DateNavigator
            selectedDate={selectedDate}
            today={today}
            onChange={setSelectedDate}
            className="hidden md:flex"
          />

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="size-10 border-2 border-ink p-0 font-bold sm:h-10 sm:w-auto sm:px-3"
              onClick={() => setHelpOpen(true)}
              aria-label="Open help"
              title="Help"
            >
              <CircleHelp />
              <span className="hidden sm:inline">Help</span>
            </Button>
            <Button
              variant="outline"
              className="size-10 border-2 border-ink p-0 font-bold sm:h-10 sm:w-auto sm:px-3"
              onClick={() => setAccountOpen(true)}
              aria-label={
                user
                  ? `Open account for ${firstNameOrEmail(user)}`
                  : 'Open account'
              }
            >
              {authChecking ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <CircleUserRound />
              )}
              <span className="hidden sm:inline">
                {user ? firstNameOrEmail(user) : 'Guest'}
              </span>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1240px] px-4 pb-28 pt-7 sm:px-6 lg:px-8">
        <section className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
              Your day, in hindsight
            </p>
            <h1 className="text-[clamp(2rem,5vw,3.7rem)] font-black leading-none tracking-[-0.065em]">
              What got done?
            </h1>
          </div>
          <SyncIndicator
            status={user && !isOnline ? 'offline' : syncStatus}
            hasAccount={Boolean(user)}
            className="hidden md:flex"
          />
        </section>

        <DateNavigator
          selectedDate={selectedDate}
          today={today}
          onChange={setSelectedDate}
          className="mb-5 flex border-y-2 border-ink py-3 md:hidden"
        />

        <section
          className="mb-6 grid grid-cols-3 gap-2 sm:gap-3"
          aria-label="Day summary"
        >
          <SummaryCard
            number={formatDuration(totalMinutes)}
            label="Logged"
            color="blue"
          />
          <SummaryCard
            number={String(selectedEntries.length)}
            label="Entries"
            color="yellow"
          />
          <SummaryCard
            number={formatDuration(longestMinutes)}
            label="Longest"
            color="red"
          />
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_310px]">
          <section
            className="border-2 border-ink bg-white"
            aria-labelledby="timeline-heading"
          >
            <div className="sticky top-[72px] z-20 flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
              <div>
                <h2 id="timeline-heading" className="font-black">
                  {isToday ? 'Today’s timeline' : formatDay(selectedDate)}
                </h2>
                <p className="text-xs font-semibold text-muted-foreground">
                  <span className="timeline-hint timeline-hint--desktop">
                    Hover for exact time · click to add · drag to select a range
                  </span>
                  <span className="timeline-hint timeline-hint--mobile">
                    Tap any time to add a precise entry
                  </span>
                </p>
              </div>
              <div className="timeline-actions flex gap-1 sm:gap-2">
                <Button
                  variant="outline"
                  className="h-9 border-2 border-ink bg-sun font-bold"
                  onClick={() => setReviewOpen(true)}
                >
                  <BookOpenText />
                  <span className="hidden sm:inline">Day in review</span>
                  <span className="sm:hidden">Review</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-9 border-2 border-ink font-bold"
                  onClick={() => setWeeklyReviewOpen(true)}
                >
                  <CalendarRange />
                  <span className="hidden sm:inline">Weekly review</span>
                  <span className="sm:hidden">Week</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-9 border-2 border-ink font-bold"
                  onClick={() => setDayMarkersOpen(true)}
                >
                  <Sunrise />
                  <span className="hidden sm:inline">Day markers</span>
                  <span className="sm:hidden">Day</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-9 border-2 border-ink font-bold"
                  onClick={jumpToNow}
                >
                  <Clock3 />
                  <span className="hidden sm:inline">Jump to now</span>
                  <span className="sm:hidden">Now</span>
                </Button>
              </div>
            </div>

            <div
              ref={timelineRef}
              className={cn(
                'timeline relative ml-1 sm:ml-5',
                dragRange && 'timeline--dragging',
              )}
              onPointerDown={handleTimelinePointerDown}
              onPointerMove={handleTimelinePointerMove}
              onPointerUp={handleTimelinePointerUp}
              onPointerCancel={handleTimelinePointerCancel}
              onPointerLeave={() => {
                if (!timelineDragRef.current) setHoverMinute(null);
              }}
            >
              {hours.map((hour) => (
                <button
                  key={hour}
                  className="timeline-row group"
                  type="button"
                  onClick={(event) => handleTimelineClick(event, hour)}
                >
                  <span className="timeline-label">{formatHour(hour)}</span>
                  <span className="timeline-rule">
                    <i />
                    <i />
                    <i />
                  </span>
                </button>
              ))}

              {isToday && (
                <div
                  ref={nowMarkerRef}
                  className="now-line"
                  style={{ top: (currentMinute / 60) * TIMELINE_ROW_HEIGHT }}
                >
                  <span>NOW</span>
                </div>
              )}

              {typeof selectedReflection?.wakeMinute === 'number' &&
                typeof selectedReflection?.sleepMinute === 'number' &&
                selectedReflection.sleepMinute >
                  selectedReflection.wakeMinute && (
                  <div
                    className="awake-window"
                    style={{
                      top:
                        (selectedReflection.wakeMinute / 60) *
                        TIMELINE_ROW_HEIGHT,
                      height:
                        ((Math.min(selectedReflection.sleepMinute, 24 * 60) -
                          selectedReflection.wakeMinute) /
                          60) *
                        TIMELINE_ROW_HEIGHT,
                    }}
                    aria-hidden="true"
                  />
                )}

              {typeof selectedReflection?.wakeMinute === 'number' && (
                <button
                  type="button"
                  className="day-boundary day-boundary--wake"
                  style={{
                    top:
                      (selectedReflection.wakeMinute / 60) *
                      TIMELINE_ROW_HEIGHT,
                  }}
                  onClick={() => setDayMarkersOpen(true)}
                  aria-label={`Woke up at ${formatBoundaryTime(selectedReflection.wakeMinute)}`}
                >
                  <span>
                    <Sunrise /> Woke{' '}
                    {formatBoundaryTime(selectedReflection.wakeMinute)}
                  </span>
                </button>
              )}

              {typeof selectedReflection?.sleepMinute === 'number' && (
                <button
                  type="button"
                  className="day-boundary day-boundary--sleep"
                  style={{
                    top:
                      (Math.min(selectedReflection.sleepMinute, 24 * 60) / 60) *
                      TIMELINE_ROW_HEIGHT,
                  }}
                  onClick={() => setDayMarkersOpen(true)}
                  aria-label={`Went to sleep at ${formatBoundaryTime(selectedReflection.sleepMinute)}`}
                >
                  <span>
                    <Moon /> Sleep{' '}
                    {formatBoundaryTime(selectedReflection.sleepMinute)}
                  </span>
                </button>
              )}

              {hoverMinute != null && !dragRange && (
                <div
                  className="timeline-hover-guide"
                  style={{
                    top: (hoverMinute / 60) * TIMELINE_ROW_HEIGHT,
                  }}
                  aria-hidden="true"
                >
                  <span>{formatTime(hoverMinute)}</span>
                </div>
              )}

              {dragRange && (
                <div
                  className="timeline-drag-selection"
                  style={{
                    top: (dragRange.startMinute / 60) * TIMELINE_ROW_HEIGHT,
                    height:
                      ((dragRange.endMinute - dragRange.startMinute) / 60) *
                      TIMELINE_ROW_HEIGHT,
                  }}
                  aria-hidden="true"
                >
                  <span>
                    {formatTime(dragRange.startMinute)}–
                    {formatTime(dragRange.endMinute)} ·{' '}
                    {formatDuration(
                      dragRange.endMinute - dragRange.startMinute,
                    )}
                  </span>
                </div>
              )}

              <div className="timeline-entries" aria-live="polite">
                {timelineGaps.map((gap) => {
                  const duration = gap.end - gap.start;
                  return (
                    <button
                      key={`${gap.start}-${gap.end}`}
                      type="button"
                      className="timeline-gap"
                      style={{
                        top: (gap.start / 60) * TIMELINE_ROW_HEIGHT,
                        height: (duration / 60) * TIMELINE_ROW_HEIGHT,
                      }}
                      onClick={() => {
                        if (suppressTimelineClickRef.current) {
                          suppressTimelineClickRef.current = false;
                          return;
                        }
                        openGapAdd(gap.start, gap.end);
                      }}
                      aria-label={`Fill unlogged time from ${formatTime(gap.start)} to ${formatTime(gap.end)}`}
                    >
                      <span>Fill {formatDuration(duration)} gap</span>
                    </button>
                  );
                })}
                {selectedEntries.map((entry) => {
                  const durationHeight =
                    ((entry.endMinute - entry.startMinute) / 60) *
                    TIMELINE_ROW_HEIGHT;
                  const isShort = durationHeight < SHORT_ENTRY_THRESHOLD;
                  const renderedHeight = isShort
                    ? Math.max(SHORT_ENTRY_MIN_HEIGHT, durationHeight)
                    : durationHeight;
                  const hidesText = renderedHeight < ENTRY_TEXT_MIN_HEIGHT;
                  const needsExpansion =
                    hidesText || overflowingEntryIds.has(entry.id);
                  const isExpanded = expandedEntryId === entry.id;
                  const entrySummary = `${formatTime(entry.startMinute)} - ${formatTime(entry.endMinute)} - ${entry.title}`;

                  return (
                    <button
                      key={entry.id}
                      ref={(element) => {
                        if (element) {
                          timelineEntryRefs.current.set(entry.id, element);
                        } else {
                          timelineEntryRefs.current.delete(entry.id);
                        }
                      }}
                      className={cn(
                        'timeline-entry',
                        `timeline-entry--${entry.color}`,
                        isShort && 'timeline-entry--compact',
                        hidesText && 'timeline-entry--text-hidden',
                        needsExpansion && 'timeline-entry--needs-expansion',
                        isExpanded && 'timeline-entry--expanded',
                        flashId === entry.id && 'timeline-entry--flash',
                      )}
                      style={
                        {
                          top: (entry.startMinute / 60) * TIMELINE_ROW_HEIGHT,
                          height: renderedHeight,
                          '--entry-base-height': `${renderedHeight}px`,
                        } as CSSProperties
                      }
                      type="button"
                      onClick={() => handleEntryClick(entry)}
                      aria-expanded={isExpanded}
                      aria-label={`View or edit ${entry.title}, ${formatTime(entry.startMinute)} to ${formatTime(entry.endMinute)}`}
                    >
                      <span className="timeline-entry-summary">
                        {entrySummary}
                      </span>
                    </button>
                  );
                })}
              </div>

              {guestLoaded && selectedEntries.length === 0 && (
                <div className="empty-timeline">
                  <span className="grid size-11 place-items-center border-2 border-ink bg-sun">
                    <ArrowDownToLine />
                  </span>
                  <div>
                    <strong>Nothing logged yet.</strong>
                    <p>
                      Start with what you just finished—you can fill the rest in
                      later.
                    </p>
                  </div>
                  <Button
                    className="rounded-none border-2 border-ink bg-blue font-black shadow-[3px_3px_0_#111]"
                    onClick={openQuickAdd}
                  >
                    <Plus /> Quick add
                  </Button>
                </div>
              )}
            </div>
          </section>

          <aside className="sticky top-[96px] hidden space-y-4 lg:block">
            <div className="border-2 border-ink bg-blue p-5 text-white shadow-[5px_5px_0_#111]">
              <span className="mb-8 grid size-10 place-items-center border-2 border-white">
                <Sparkles />
              </span>
              <h2 className="text-2xl font-black tracking-[-0.04em]">
                Log it while it’s fresh.
              </h2>
              <p className="mt-2 text-sm font-semibold text-white/80">
                Choose how long you spent, jot down what happened, and get back
                to it.
              </p>
              <Button
                className="mt-5 h-12 w-full rounded-none border-2 border-ink bg-sun text-base font-black text-ink shadow-[3px_3px_0_#111] hover:bg-sun/90"
                onClick={openQuickAdd}
              >
                <Plus className="size-5" /> Quick add
              </Button>
            </div>

            <div className="border-2 border-ink bg-white p-5">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                A small nudge
              </p>
              {suggestedGap ? (
                <>
                  <p className="mt-3 text-lg font-black leading-snug">
                    There’s an open stretch from{' '}
                    {formatTime(suggestedGap.start)} to{' '}
                    {formatTime(suggestedGap.end)}.
                  </p>
                  <button
                    className="mt-4 inline-flex items-center gap-1 text-sm font-black underline decoration-2 underline-offset-4"
                    onClick={() => openDetailedAdd(suggestedGap.start)}
                  >
                    Fill the gap <ChevronRight className="size-4" />
                  </button>
                </>
              ) : (
                <p className="mt-3 text-lg font-black leading-snug">
                  Your day is looking nicely filled in.
                </p>
              )}
            </div>

            <SyncIndicator
              status={user && !isOnline ? 'offline' : syncStatus}
              hasAccount={Boolean(user)}
              className="flex border-2 border-ink bg-white p-4"
            />
          </aside>
        </div>
      </div>

      <Button
        className="fixed bottom-5 right-4 z-40 h-14 rounded-none border-2 border-ink bg-blue px-5 text-base font-black text-white shadow-[4px_4px_0_#111] hover:bg-blue/90 sm:right-6 lg:hidden"
        onClick={openQuickAdd}
      >
        <Plus className="size-5" /> Quick add
      </Button>

      <EntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        mode={editorMode}
        title={entryTitle}
        setTitle={setEntryTitle}
        details={entryDetails}
        setDetails={setEntryDetails}
        showDetails={showEntryDetails}
        setShowDetails={setShowEntryDetails}
        focusDetails={focusEntryDetails}
        naturalDraft={naturalDraft}
        markerSuggestion={markerSuggestion}
        markerMinute={
          editorMode === 'quick'
            ? editorRange.endMinute
            : editorRange.startMinute
        }
        duration={Math.max(0, editorRange.endMinute - editorRange.startMinute)}
        setDuration={setEditorDuration}
        customDuration={customDuration}
        setCustomDuration={setCustomDuration}
        start={entryStart}
        setStart={(time) => {
          setEntryStart(time);
          const nextDuration = inputToMinute(entryEnd) - inputToMinute(time);
          if (nextDuration > 0) setSelectedDuration(nextDuration);
        }}
        end={entryEnd}
        setEnd={(time) => {
          setEntryEnd(time);
          const nextDuration = inputToMinute(time) - inputToMinute(entryStart);
          if (nextDuration > 0) setSelectedDuration(nextDuration);
        }}
        range={editorRange}
        error={entryError}
        onSubmit={handleEntrySubmit}
        onDelete={deleteEditingEntry}
        onDuplicate={duplicateEditingEntry}
        onSetMarker={setMarkerFromEntry}
      />

      <DayReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        date={selectedDate}
        isToday={isToday}
        entries={selectedEntries}
        totalMinutes={totalMinutes}
        reflection={selectedReflection}
        onSaveReflection={saveSelectedReflection}
      />

      <WeeklyReviewDialog
        open={weeklyReviewOpen}
        onOpenChange={setWeeklyReviewOpen}
        selectedDate={selectedDate || today}
        today={today}
        entries={activeEntries.filter((entry) => !entry.deletedAt)}
        reflections={activeReflections}
      />

      <DayMarkersDialog
        open={dayMarkersOpen}
        onOpenChange={setDayMarkersOpen}
        date={selectedDate || today}
        isToday={isToday}
        reflection={selectedReflection}
        onSave={saveSelectedMarkers}
      />

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />

      <AccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        user={user}
        configured={firebaseConfigured}
        authMode={authMode}
        setAuthMode={setAuthMode}
        email={email}
        setEmail={setEmail}
        password={password}
        setPassword={setPassword}
        authError={authError}
        authBusy={authBusy}
        syncStatus={user && !isOnline ? 'offline' : syncStatus}
        onAuth={handleAuth}
        onGoogle={handleGoogleSignIn}
        onReset={handleResetPassword}
        onSignOut={handleSignOut}
        onExport={exportBackup}
        onImport={() => fileInputRef.current?.click()}
      />

      <Dialog open={migrationOpen} onOpenChange={setMigrationOpen}>
        <DialogContent className="rounded-none border-2 border-ink p-0 shadow-[7px_7px_0_#111] sm:max-w-[440px]">
          <DialogHeader className="border-b-2 border-ink p-5 pr-14">
            <DialogTitle className="text-2xl font-black tracking-[-0.04em]">
              Bring this device with you?
            </DialogTitle>
            <DialogDescription className="font-medium">
              You have{' '}
              {guestEntries.filter((entry) => !entry.deletedAt).length +
                guestReflections.filter(hasReflectionContent).length}{' '}
              device-only records. Move them into your account so they appear
              everywhere.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <Button
              variant="outline"
              className="h-11 rounded-none border-2 border-ink font-black"
              onClick={() => setMigrationOpen(false)}
            >
              Not now
            </Button>
            <Button
              className="h-11 rounded-none border-2 border-ink bg-blue font-black shadow-[3px_3px_0_#111]"
              onClick={migrateGuestEntries}
            >
              Move entries
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        onChange={importBackup}
      />
      {toast && (
        <output
          className={cn('app-toast', toastActionEntry && 'app-toast--action')}
          aria-live="polite"
        >
          <Check />
          <span>{toast}</span>
          {toastActionEntry && (
            <button
              type="button"
              onClick={() => {
                const entry = toastActionEntry;
                setToast('');
                setToastActionEntry(null);
                openEdit(entry, true);
              }}
            >
              Add details
            </button>
          )}
        </output>
      )}
    </main>
  );
}

function DateNavigator({
  selectedDate,
  today,
  onChange,
  className,
}: {
  selectedDate: string;
  today: string;
  onChange: (date: string) => void;
  className?: string;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const activeDate = selectedDate || today;

  return (
    <div className={cn('items-center justify-between gap-2', className)}>
      <Button
        variant="ghost"
        size="icon"
        className="date-arrow"
        aria-label="Previous day"
        onClick={() => onChange(shiftDate(selectedDate || today, -1))}
      >
        <ChevronLeft />
      </Button>
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger className="date-picker" aria-label="Choose date">
          <CalendarDays />
          <span>
            {selectedDate === today
              ? `Today · ${formatDay(today, true)}`
              : formatDay(activeDate, true)}
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          sideOffset={8}
          className="date-calendar-popover w-auto rounded-none border-2 border-ink bg-white p-2 shadow-[5px_5px_0_#111] ring-0"
        >
          <Calendar
            mode="single"
            selected={dateFromKey(activeDate)}
            defaultMonth={dateFromKey(activeDate)}
            disabled={{ after: dateFromKey(today) }}
            onSelect={(date) => {
              if (!date) return;
              onChange(dateKey(date));
              setCalendarOpen(false);
            }}
            className="daymark-calendar"
            buttonVariant="ghost"
          />
          {activeDate !== today && (
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full rounded-none border-2 border-ink bg-sun font-black"
              onClick={() => {
                onChange(today);
                setCalendarOpen(false);
              }}
            >
              Jump to today
            </Button>
          )}
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon"
        className="date-arrow"
        aria-label="Next day"
        disabled={!selectedDate || selectedDate >= today}
        onClick={() => onChange(shiftDate(selectedDate, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

function SummaryCard({
  number,
  label,
  color,
}: {
  number: string;
  label: string;
  color: 'blue' | 'yellow' | 'red';
}) {
  return (
    <div className={cn('summary-card', `summary-card--${color}`)}>
      <strong>{number}</strong>
      <span>{label}</span>
    </div>
  );
}

function SyncIndicator({
  status,
  hasAccount,
  className,
}: {
  status: SyncStatus;
  hasAccount: boolean;
  className?: string;
}) {
  const content = !hasAccount
    ? {
        icon: <Download />,
        label: 'Saved on this device',
        detail: 'Sign in for sync',
      }
    : status === 'offline'
      ? {
          icon: <WifiOff />,
          label: 'You’re offline',
          detail: 'Changes will sync later',
        }
      : status === 'syncing'
        ? {
            icon: <LoaderCircle className="animate-spin" />,
            label: 'Syncing changes',
            detail: 'Keep this tab open',
          }
        : status === 'error'
          ? {
              icon: <CloudOff />,
              label: 'Sync needs attention',
              detail: 'Your local copy is safe',
            }
          : {
              icon: <Cloud />,
              label: 'Synced everywhere',
              detail: 'All changes saved',
            };
  return (
    <div className={cn('items-center gap-3', className)}>
      <span
        className={cn(
          'sync-icon',
          hasAccount && status === 'saved' && 'sync-icon--green',
          status === 'offline' && 'sync-icon--yellow',
          status === 'error' && 'sync-icon--red',
        )}
      >
        {content.icon}
      </span>
      <span className="flex flex-col">
        <strong className="text-sm font-black">{content.label}</strong>
        <small className="font-semibold text-muted-foreground">
          {content.detail}
        </small>
      </span>
    </div>
  );
}

type EntryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: EditorMode;
  title: string;
  setTitle: (title: string) => void;
  details: string;
  setDetails: (details: string) => void;
  showDetails: boolean;
  setShowDetails: (show: boolean) => void;
  focusDetails: boolean;
  naturalDraft: NaturalEntryDraft | null;
  markerSuggestion: DayMarkerKind | null;
  markerMinute: number;
  duration: number;
  setDuration: (duration: number) => void;
  customDuration: boolean;
  setCustomDuration: (custom: boolean) => void;
  start: string;
  setStart: (time: string) => void;
  end: string;
  setEnd: (time: string) => void;
  range: { startMinute: number; endMinute: number };
  error: string;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSetMarker: (kind: DayMarkerKind) => Promise<void>;
};

type DayReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  isToday: boolean;
  entries: TimelineEntry[];
  totalMinutes: number;
  reflection: DailyReflection | null;
  onSaveReflection: (fields: {
    biggestWin: string;
    tomorrowFocus: string;
  }) => Promise<void>;
};

function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="help-dialog rounded-none border-2 border-ink p-0 shadow-[7px_7px_0_#111] sm:max-w-[650px]"
      >
        <DialogHeader className="border-b-2 border-ink bg-sun p-5 pr-14">
          <DialogTitle className="text-2xl font-black tracking-[-0.04em]">
            How Daymark works
          </DialogTitle>
          <DialogDescription className="font-semibold text-ink/75">
            Record what happened, fill the gaps, and look back on your day.
          </DialogDescription>
        </DialogHeader>

        <div className="help-body">
          <ol className="help-steps" aria-label="Daymark quick start">
            <li>
              <span>1</span>
              <div>
                <strong>Log what you just finished</strong>
                <p>
                  Choose Quick add, pick a duration, and write the
                  accomplishment. You can also type phrases like “Read for 25m”
                  or “Lunch 12:30–1pm.”
                </p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>Fill in the timeline</strong>
                <p>
                  Tap or click a blank time to create a precise entry. On a
                  desktop, the guide snaps to five-minute marks and you can drag
                  across blank space to select a time range.
                </p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>Review the day</strong>
                <p>
                  Open Day in review for a reading-friendly list and reflection,
                  or Weekly review to see your progress across the week.
                </p>
              </div>
            </li>
          </ol>

          <div className="help-grid">
            <section>
              <div className="help-section-title">
                <Sunrise />
                <h3>Start and end the day</h3>
              </div>
              <p>
                Open Day markers, or choose Day start or Sleep while adding from
                the timeline. Typing “Woke up” or “Went to bed” also suggests
                the matching marker.
              </p>
            </section>
            <section>
              <div className="help-section-title">
                <CalendarDays />
                <h3>Move between dates</h3>
              </div>
              <p>
                Use the arrows or tap the date to open the calendar. The Daymark
                logo reloads the app whenever you need a fresh start.
              </p>
            </section>
            <section>
              <div className="help-section-title">
                <Cloud />
                <h3>Sync and back up</h3>
              </div>
              <p>
                Guest entries stay on this device. Sign in to keep your phone
                and desktop in sync. Export and import backups from Account.
              </p>
            </section>
            <section>
              <div className="help-section-title">
                <BookOpenText />
                <h3>Edit an entry</h3>
              </div>
              <p>
                Select an accomplishment to edit, duplicate, or delete it. On
                mobile, the first tap brings an overlapped entry forward; tap it
                again to edit.
              </p>
            </section>
          </div>

          <div className="help-note">
            <Clock3 />
            <p>
              <strong>On mobile:</strong> drag-to-select is turned off so normal
              scrolling stays easy. Tap a time or use Quick add instead.
            </p>
          </div>
        </div>

        <DialogFooter className="border-t-2 border-ink bg-white p-4">
          <Button
            type="button"
            className="h-11 rounded-none border-2 border-ink bg-primary px-7 font-black text-white shadow-[3px_3px_0_#111] hover:bg-primary/90"
            onClick={() => onOpenChange(false)}
          >
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DayReviewDialog({
  open,
  onOpenChange,
  date,
  isToday,
  entries,
  totalMinutes,
  reflection,
  onSaveReflection,
}: DayReviewDialogProps) {
  const [biggestWin, setBiggestWin] = useState('');
  const [tomorrowFocus, setTomorrowFocus] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>(
    'saved',
  );
  const savedDraft = useRef({ biggestWin: '', tomorrowFocus: '' });

  useEffect(() => {
    if (!open) return;
    const next = {
      biggestWin: reflection?.biggestWin ?? '',
      tomorrowFocus: reflection?.tomorrowFocus ?? '',
    };
    setBiggestWin(next.biggestWin);
    setTomorrowFocus(next.tomorrowFocus);
    savedDraft.current = next;
    setSaveStatus('saved');
  }, [
    date,
    open,
    reflection?.biggestWin,
    reflection?.tomorrowFocus,
    reflection?.updatedAt,
  ]);

  async function saveReflection() {
    const next = {
      biggestWin: biggestWin.trim(),
      tomorrowFocus: tomorrowFocus.trim(),
    };
    if (
      next.biggestWin === savedDraft.current.biggestWin &&
      next.tomorrowFocus === savedDraft.current.tomorrowFocus
    ) {
      return;
    }
    savedDraft.current = next;
    setSaveStatus('saving');
    await onSaveReflection(next);
    setSaveStatus('saved');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) void saveReflection();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        mobileSheet
        className="day-review-dialog rounded-none border-2 border-ink p-0 shadow-[7px_7px_0_#111] sm:max-w-[620px]"
      >
        <DialogHeader className="border-b-2 border-ink bg-sun p-5 pr-14">
          <DialogTitle className="text-2xl font-black tracking-[-0.04em]">
            {isToday ? 'Today' : formatDay(date)} in review
          </DialogTitle>
          <DialogDescription className="font-semibold text-ink/75">
            Read back what happened, then leave a thought for yourself.
          </DialogDescription>
        </DialogHeader>

        <div className="day-review-summary">
          <span>
            <strong>{entries.length}</strong>{' '}
            {entries.length === 1 ? 'accomplishment' : 'accomplishments'}
          </span>
          <span>
            <strong>{formatDuration(totalMinutes)}</strong> logged
          </span>
        </div>

        {entries.length ? (
          <ol className="day-review-list">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  'day-review-item',
                  `day-review-item--${entry.color}`,
                )}
              >
                <time>
                  {formatTime(entry.startMinute)}–{formatTime(entry.endMinute)}
                </time>
                <div>
                  <p>{entry.title}</p>
                  {entry.details && (
                    <p className="day-review-item__details">{entry.details}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="day-review-empty">
            <BookOpenText />
            <strong>No accomplishments recorded for this day.</strong>
            <p>They’ll appear here in time order as you fill the timeline.</p>
          </div>
        )}

        <section className="day-reflection" aria-labelledby="reflection-title">
          <div className="day-reflection__heading">
            <div>
              <p>Close the loop</p>
              <h3 id="reflection-title">A quick reflection</h3>
            </div>
            <span aria-live="polite">
              {saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'unsaved'
                  ? 'Saves when you leave the field'
                  : 'Saved automatically'}
            </span>
          </div>
          <div className="day-reflection__fields">
            <label htmlFor="biggest-win">
              <span>
                <Trophy /> Biggest win
              </span>
              <Textarea
                id="biggest-win"
                value={biggestWin}
                maxLength={2000}
                onChange={(event) => {
                  setBiggestWin(event.target.value);
                  setSaveStatus('unsaved');
                }}
                onBlur={() => void saveReflection()}
                placeholder="What felt most meaningful today?"
              />
            </label>
            <label htmlFor="tomorrow-focus">
              <span>
                <Target /> Tomorrow’s focus
              </span>
              <Textarea
                id="tomorrow-focus"
                value={tomorrowFocus}
                maxLength={2000}
                onChange={(event) => {
                  setTomorrowFocus(event.target.value);
                  setSaveStatus('unsaved');
                }}
                onBlur={() => void saveReflection()}
                placeholder="What deserves your attention next?"
              />
            </label>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

type DayMarkersDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  isToday: boolean;
  reflection: DailyReflection | null;
  onSave: (fields: {
    wakeMinute: number | null;
    sleepMinute: number | null;
  }) => Promise<void>;
};

function DayMarkersDialog({
  open,
  onOpenChange,
  date,
  isToday,
  reflection,
  onSave,
}: DayMarkersDialogProps) {
  const [wakeTime, setWakeTime] = useState('');
  const [sleepTime, setSleepTime] = useState('');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>(
    'saved',
  );
  const savedMarkers = useRef<{
    wakeMinute: number | null;
    sleepMinute: number | null;
  }>({ wakeMinute: null, sleepMinute: null });

  useEffect(() => {
    if (!open) return;
    const next = {
      wakeMinute:
        typeof reflection?.wakeMinute === 'number'
          ? reflection.wakeMinute
          : null,
      sleepMinute:
        typeof reflection?.sleepMinute === 'number'
          ? reflection.sleepMinute
          : null,
    };
    savedMarkers.current = next;
    setWakeTime(
      next.wakeMinute == null ? '' : minuteToInput(next.wakeMinute % (24 * 60)),
    );
    setSleepTime(
      next.sleepMinute == null
        ? ''
        : minuteToInput(next.sleepMinute % (24 * 60)),
    );
    setSaveStatus('saved');
  }, [
    date,
    open,
    reflection?.sleepMinute,
    reflection?.updatedAt,
    reflection?.wakeMinute,
  ]);

  function currentValues(nextWake = wakeTime, nextSleep = sleepTime) {
    const wakeMinute = nextWake ? inputToMinute(nextWake) : null;
    const rawSleepMinute = nextSleep ? inputToMinute(nextSleep) : null;
    const sleepMinute =
      wakeMinute != null &&
      rawSleepMinute != null &&
      rawSleepMinute <= wakeMinute
        ? rawSleepMinute + 24 * 60
        : rawSleepMinute;
    return { wakeMinute, sleepMinute };
  }

  async function saveMarkers(nextWake = wakeTime, nextSleep = sleepTime) {
    const next = currentValues(nextWake, nextSleep);
    if (
      next.wakeMinute === savedMarkers.current.wakeMinute &&
      next.sleepMinute === savedMarkers.current.sleepMinute
    ) {
      return;
    }
    savedMarkers.current = next;
    setSaveStatus('saving');
    await onSave(next);
    setSaveStatus('saved');
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) void saveMarkers();
    onOpenChange(nextOpen);
  }

  async function applyCurrentTime(kind: 'wake' | 'sleep') {
    const time = minuteToInput(minutesNow());
    const nextWake = kind === 'wake' ? time : wakeTime;
    const nextSleep = kind === 'sleep' ? time : sleepTime;
    setWakeTime(nextWake);
    setSleepTime(nextSleep);
    setSaveStatus('unsaved');
    await saveMarkers(nextWake, nextSleep);
  }

  async function clearMarker(kind: 'wake' | 'sleep') {
    const nextWake = kind === 'wake' ? '' : wakeTime;
    const nextSleep = kind === 'sleep' ? '' : sleepTime;
    setWakeTime(nextWake);
    setSleepTime(nextSleep);
    setSaveStatus('unsaved');
    await saveMarkers(nextWake, nextSleep);
  }

  const resolvedValues = currentValues();
  const dayLength =
    resolvedValues.wakeMinute != null &&
    resolvedValues.sleepMinute != null &&
    resolvedValues.sleepMinute > resolvedValues.wakeMinute
      ? resolvedValues.sleepMinute - resolvedValues.wakeMinute
      : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        mobileSheet
        className="day-markers-dialog rounded-none border-2 border-ink p-0 shadow-[7px_7px_0_#111] sm:max-w-[500px]"
      >
        <DialogHeader className="border-b-2 border-ink bg-sun p-5 pr-14">
          <DialogTitle className="text-2xl font-black tracking-[-0.04em]">
            Day markers
          </DialogTitle>
          <DialogDescription className="font-semibold text-ink/75">
            Mark when {isToday ? 'today' : formatDay(date)} began and ended.
          </DialogDescription>
        </DialogHeader>

        <div className="day-markers-status">
          <span>
            {saveStatus === 'saving'
              ? 'Saving…'
              : saveStatus === 'unsaved'
                ? 'Saves when you leave the field'
                : 'Saved automatically'}
          </span>
          {dayLength != null && (
            <strong>{formatDuration(dayLength)} awake</strong>
          )}
        </div>

        <div className="day-marker-fields">
          <section className="day-marker-field day-marker-field--wake">
            <div>
              <span className="day-marker-icon">
                <Sunrise />
              </span>
              <div>
                <strong>Woke up</strong>
                <small>Start of your day</small>
              </div>
            </div>
            <Input
              type="time"
              value={wakeTime}
              onChange={(event) => {
                setWakeTime(event.target.value);
                setSaveStatus('unsaved');
              }}
              onBlur={() => void saveMarkers()}
              aria-label="Wake time"
            />
            <div className="day-marker-actions">
              {isToday && (
                <button
                  type="button"
                  onClick={() => void applyCurrentTime('wake')}
                >
                  Use now
                </button>
              )}
              {wakeTime && (
                <button type="button" onClick={() => void clearMarker('wake')}>
                  Clear
                </button>
              )}
            </div>
          </section>

          <section className="day-marker-field day-marker-field--sleep">
            <div>
              <span className="day-marker-icon">
                <Moon />
              </span>
              <div>
                <strong>Went to sleep</strong>
                <small>End of your day</small>
              </div>
            </div>
            <Input
              type="time"
              value={sleepTime}
              onChange={(event) => {
                setSleepTime(event.target.value);
                setSaveStatus('unsaved');
              }}
              onBlur={() => void saveMarkers()}
              aria-label="Sleep time"
            />
            <div className="day-marker-actions">
              {isToday && (
                <button
                  type="button"
                  onClick={() => void applyCurrentTime('sleep')}
                >
                  Use now
                </button>
              )}
              {sleepTime && (
                <button type="button" onClick={() => void clearMarker('sleep')}>
                  Clear
                </button>
              )}
            </div>
          </section>
        </div>

        <p className="day-markers-note">
          If your sleep time is earlier than your wake time, Daymark treats it
          as after midnight on the following day.
        </p>
      </DialogContent>
    </Dialog>
  );
}

type WeeklyReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  today: string;
  entries: TimelineEntry[];
  reflections: DailyReflection[];
};

function WeeklyReviewDialog({
  open,
  onOpenChange,
  selectedDate,
  today,
  entries,
  reflections,
}: WeeklyReviewDialogProps) {
  const currentWeekStart = startOfWeekKey(today);
  const [weekStart, setWeekStart] = useState(startOfWeekKey(selectedDate));

  useEffect(() => {
    if (open) setWeekStart(startOfWeekKey(selectedDate));
  }, [open, selectedDate]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = shiftDate(weekStart, index);
        const dayEntries = entries
          .filter((entry) => entry.date === date && !entry.deletedAt)
          .sort((a, b) => a.startMinute - b.startMinute);
        return {
          date,
          entries: dayEntries,
          reflection:
            reflections.find((reflection) => reflection.date === date) ?? null,
          totalMinutes: dayEntries.reduce(
            (total, entry) => total + entry.endMinute - entry.startMinute,
            0,
          ),
        };
      }),
    [entries, reflections, weekStart],
  );
  const weekEntries = days.flatMap((day) => day.entries);
  const weekMinutes = days.reduce((total, day) => total + day.totalMinutes, 0);
  const activeDays = days.filter(
    (day) => day.entries.length || hasReflectionContent(day.reflection),
  ).length;
  const longestEntry = weekEntries.reduce<TimelineEntry | null>(
    (longest, entry) =>
      !longest ||
      entry.endMinute - entry.startMinute >
        longest.endMinute - longest.startMinute
        ? entry
        : longest,
    null,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="weekly-review-dialog rounded-none border-2 border-ink p-0 shadow-[7px_7px_0_#111] sm:max-w-[760px]"
      >
        <DialogHeader className="border-b-2 border-ink bg-blue p-5 pr-14 text-white">
          <DialogTitle className="text-2xl font-black tracking-[-0.04em]">
            Weekly review
          </DialogTitle>
          <DialogDescription className="font-semibold text-white/80">
            Your accomplishments and reflections, together in one place.
          </DialogDescription>
        </DialogHeader>

        <div className="weekly-review-nav">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(shiftDate(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft />
          </Button>
          <strong>
            {formatDay(weekStart, true)}–
            {formatDay(shiftDate(weekStart, 6), true)}
          </strong>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={weekStart >= currentWeekStart}
            onClick={() => setWeekStart(shiftDate(weekStart, 7))}
            aria-label="Next week"
          >
            <ChevronRight />
          </Button>
        </div>

        <section className="weekly-review-summary" aria-label="Week summary">
          <div>
            <strong>{formatDuration(weekMinutes)}</strong>
            <span>logged</span>
          </div>
          <div>
            <strong>{weekEntries.length}</strong>
            <span>accomplishments</span>
          </div>
          <div>
            <strong>{activeDays}</strong>
            <span>active days</span>
          </div>
        </section>

        <p className="weekly-review-narrative">
          {weekEntries.length ? (
            <>
              You recorded <strong>{weekEntries.length}</strong>{' '}
              {weekEntries.length === 1 ? 'accomplishment' : 'accomplishments'}{' '}
              across <strong>{activeDays}</strong>{' '}
              {activeDays === 1 ? 'day' : 'days'}.
              {longestEntry && (
                <>
                  {' '}
                  Your longest focused stretch was{' '}
                  <strong>
                    {formatDuration(
                      longestEntry.endMinute - longestEntry.startMinute,
                    )}
                  </strong>{' '}
                  on {formatDay(longestEntry.date, true)}.
                </>
              )}
            </>
          ) : (
            'Nothing is recorded for this week yet. Your entries and reflections will collect here as the week unfolds.'
          )}
        </p>

        <div className="weekly-review-days">
          {days.map((day) => (
            <section
              key={day.date}
              className={cn(
                'weekly-day',
                day.date === today && 'weekly-day--today',
              )}
            >
              <header>
                <div>
                  <strong>
                    {day.date === today ? 'Today' : formatDay(day.date, true)}
                  </strong>
                  <span>{formatDuration(day.totalMinutes)}</span>
                </div>
                <small>
                  {day.entries.length}{' '}
                  {day.entries.length === 1 ? 'entry' : 'entries'}
                </small>
              </header>

              {(typeof day.reflection?.wakeMinute === 'number' ||
                typeof day.reflection?.sleepMinute === 'number') && (
                <div className="weekly-day__bounds">
                  {typeof day.reflection?.wakeMinute === 'number' && (
                    <span>
                      <Sunrise />
                      {formatBoundaryTime(day.reflection.wakeMinute)}
                    </span>
                  )}
                  {typeof day.reflection?.sleepMinute === 'number' && (
                    <span>
                      <Moon />
                      {formatBoundaryTime(day.reflection.sleepMinute)}
                    </span>
                  )}
                  {typeof day.reflection?.wakeMinute === 'number' &&
                    typeof day.reflection?.sleepMinute === 'number' &&
                    day.reflection.sleepMinute > day.reflection.wakeMinute && (
                      <strong>
                        {formatDuration(
                          day.reflection.sleepMinute -
                            day.reflection.wakeMinute,
                        )}{' '}
                        awake
                      </strong>
                    )}
                </div>
              )}

              {day.entries.length ? (
                <ol>
                  {day.entries.map((entry) => (
                    <li key={entry.id}>
                      <time>
                        {formatTime(entry.startMinute)}–
                        {formatTime(entry.endMinute)}
                      </time>
                      <span>{entry.title}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="weekly-day__empty">No accomplishments logged.</p>
              )}

              {hasReflectionContent(day.reflection) && (
                <div className="weekly-day__reflection">
                  {day.reflection.biggestWin && (
                    <p>
                      <Trophy />
                      <span>
                        <strong>Biggest win</strong>
                        {day.reflection.biggestWin}
                      </span>
                    </p>
                  )}
                  {day.reflection.tomorrowFocus && (
                    <p>
                      <Target />
                      <span>
                        <strong>Next focus</strong>
                        {day.reflection.tomorrowFocus}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EntryDialog(props: EntryDialogProps) {
  const isQuick = props.mode === 'quick';
  const isEdit = props.mode === 'edit';
  const durationHours = Math.floor(props.duration / 60);
  const durationMinutes = props.duration % 60;
  const [hoursText, setHoursText] = useState(String(durationHours));
  const [minutesText, setMinutesText] = useState(String(durationMinutes));

  useEffect(() => {
    setHoursText(String(durationHours));
    setMinutesText(String(durationMinutes));
  }, [durationHours, durationMinutes]);

  function updateHours(value: string) {
    setHoursText(value);
    if (value === '') return;
    const hours = Number(value);
    if (!Number.isFinite(hours)) return;
    props.setDuration(Math.max(0, hours) * 60 + durationMinutes);
  }

  function updateMinutes(value: string) {
    setMinutesText(value);
    if (value === '') return;
    const minutes = Number(value);
    if (!Number.isFinite(minutes)) return;
    props.setDuration(durationHours * 60 + Math.max(0, minutes));
  }

  function restoreDurationText() {
    setHoursText(String(durationHours));
    setMinutesText(String(durationMinutes));
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        mobileSheet
        className="quick-dialog rounded-none border-2 border-ink p-0 shadow-[7px_7px_0_#111] sm:max-w-[480px]"
      >
        <DialogHeader className="border-b-2 border-ink p-5 pr-14">
          <DialogTitle className="text-2xl font-black tracking-[-0.04em]">
            {isEdit
              ? 'Edit what happened'
              : isQuick
                ? 'What did you get done?'
                : 'Add to your timeline'}
          </DialogTitle>
          <DialogDescription className="font-medium">
            {isQuick
              ? 'Add it to the time just before now.'
              : 'Set how long it took, then fine-tune the times if needed.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={props.onSubmit}>
          <div className="space-y-5 p-5">
            <Textarea
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- opening this fast-capture dialog should put the user directly in the writing field.
              autoFocus={!props.focusDetails}
              value={props.title}
              onChange={(event) => props.setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              className="min-h-28 rounded-none border-2 border-ink text-base shadow-[inset_0_-3px_0_#f4f1ea] focus-visible:ring-blue/25"
              placeholder="Finished the project outline…"
              aria-label="What did you do?"
            />

            {!isEdit && (
              <>
                {props.markerSuggestion ? (
                  <button
                    type="button"
                    className={cn(
                      'marker-suggestion',
                      `marker-suggestion--${props.markerSuggestion}`,
                    )}
                    onClick={() =>
                      void props.onSetMarker(props.markerSuggestion!)
                    }
                  >
                    {props.markerSuggestion === 'wake' ? <Sunrise /> : <Moon />}
                    <span>
                      <small>Day marker suggested</small>
                      <strong>
                        {props.markerSuggestion === 'wake'
                          ? 'Set day start'
                          : 'Set sleep time'}{' '}
                        · {formatTime(props.markerMinute)}
                      </strong>
                    </span>
                    <ChevronRight />
                  </button>
                ) : (
                  <div className="natural-entry-help">
                    {props.naturalDraft ? (
                      <>
                        <Sparkles />
                        <span>
                          Understood:{' '}
                          <strong>{props.naturalDraft.title}</strong>,{' '}
                          {formatTime(props.naturalDraft.startMinute)}–
                          {formatTime(props.naturalDraft.endMinute)}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="natural-entry-help__example">Try</span>
                        <span>
                          “Read for 25m”, “Lunch 12:30–1pm”, or “Woke up”
                        </span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            <section
              className="duration-control"
              aria-labelledby="duration-label"
            >
              <div className="duration-control__heading">
                <p id="duration-label">How long did it take?</p>
                <strong>{formatDuration(props.duration)}</strong>
              </div>

              <div className="duration-steppers">
                <div className="duration-stepper">
                  <button
                    type="button"
                    onClick={() => props.setDuration(props.duration - 60)}
                    disabled={props.duration <= 5}
                    aria-label="Decrease duration by one hour"
                  >
                    <ChevronLeft />
                  </button>
                  <label className="duration-value">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={hoursText}
                      onChange={(event) => updateHours(event.target.value)}
                      onFocus={(event) => event.currentTarget.select()}
                      onBlur={restoreDurationText}
                      aria-label="Duration hours"
                    />
                    <small>{durationHours === 1 ? 'hour' : 'hours'}</small>
                  </label>
                  <button
                    type="button"
                    onClick={() => props.setDuration(props.duration + 60)}
                    aria-label="Increase duration by one hour"
                  >
                    <ChevronRight />
                  </button>
                </div>

                <div className="duration-stepper">
                  <button
                    type="button"
                    onClick={() => props.setDuration(props.duration - 5)}
                    disabled={props.duration <= 5}
                    aria-label="Decrease duration by five minutes"
                  >
                    <ChevronLeft />
                  </button>
                  <label className="duration-value">
                    <input
                      type="number"
                      min="0"
                      step="5"
                      inputMode="numeric"
                      value={minutesText}
                      onChange={(event) => updateMinutes(event.target.value)}
                      onFocus={(event) => event.currentTarget.select()}
                      onBlur={restoreDurationText}
                      aria-label="Duration minutes"
                    />
                    <small>minutes</small>
                  </label>
                  <button
                    type="button"
                    onClick={() => props.setDuration(props.duration + 5)}
                    aria-label="Increase duration by five minutes"
                  >
                    <ChevronRight />
                  </button>
                </div>
              </div>

              <div className="duration-quick-set">
                <span>Quick set</span>
                <div>
                  {[5, 15, 30, 60].map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className={cn(
                        'duration-chip',
                        props.duration === minutes && 'duration-chip--active',
                      )}
                      onClick={() => props.setDuration(minutes)}
                    >
                      {minutes === 60 ? '1 hr' : `${minutes}m`}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <button
              type="button"
              className="manual-time-toggle"
              onClick={() => props.setCustomDuration(!props.customDuration)}
              aria-expanded={props.customDuration}
            >
              <Clock3 />
              {props.customDuration ? 'Hide exact times' : 'Enter exact times'}
              {props.customDuration ? <ChevronLeft /> : <ChevronRight />}
            </button>

            {props.customDuration && (
              <div className="manual-time-fields grid grid-cols-2 gap-3">
                <label className="time-field" htmlFor="entry-start">
                  <span>Start</span>
                  <Input
                    id="entry-start"
                    type="time"
                    value={props.start}
                    onChange={(event) => props.setStart(event.target.value)}
                  />
                </label>
                <label className="time-field" htmlFor="entry-end">
                  <span>End</span>
                  <Input
                    id="entry-end"
                    type="time"
                    value={props.end}
                    onChange={(event) => props.setEnd(event.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="time-preview">
              <Clock3 />
              <span>
                {formatTime(props.range.startMinute)}–
                {formatTime(props.range.endMinute)}
              </span>
              <strong>
                {formatDuration(
                  Math.max(0, props.range.endMinute - props.range.startMinute),
                )}
              </strong>
            </div>

            {!isEdit && (
              <div className="entry-marker-actions">
                <span>Use {formatTime(props.markerMinute)} as</span>
                <button
                  type="button"
                  onClick={() => void props.onSetMarker('wake')}
                >
                  <Sunrise /> Day start
                </button>
                <button
                  type="button"
                  onClick={() => void props.onSetMarker('sleep')}
                >
                  <Moon /> Sleep
                </button>
              </div>
            )}

            <button
              type="button"
              className="details-toggle"
              onClick={() => props.setShowDetails(!props.showDetails)}
              aria-expanded={props.showDetails}
            >
              <FileText />
              {props.showDetails
                ? 'Hide optional details'
                : isEdit
                  ? 'Add or edit details'
                  : 'Add details (optional)'}
              {props.showDetails ? <ChevronLeft /> : <ChevronRight />}
            </button>

            {props.showDetails && (
              <label className="details-field" htmlFor="entry-details">
                <span>Notes, outcome, or context</span>
                <Textarea
                  id="entry-details"
                  // oxlint-disable-next-line jsx-a11y/no-autofocus -- the post-save action intentionally moves focus into the optional details field.
                  autoFocus={props.focusDetails}
                  value={props.details}
                  onChange={(event) => props.setDetails(event.target.value)}
                  className="min-h-24 rounded-none border-2 border-ink bg-white text-base"
                  placeholder="What changed, what you decided, or anything worth remembering…"
                  aria-label="Optional accomplishment details"
                />
              </label>
            )}
            {props.error && (
              <p className="form-error" role="alert">
                {props.error}
              </p>
            )}
          </div>

          <DialogFooter className="m-0 flex-row justify-between rounded-none border-t-2 border-ink bg-white p-4">
            {isEdit ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="h-11 w-11 rounded-none border-2 border-ink"
                  onClick={props.onDelete}
                  aria-label="Delete entry"
                >
                  <Trash2 />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-none border-2 border-ink"
                  onClick={props.onDuplicate}
                  aria-label="Duplicate entry"
                >
                  <Copy />
                </Button>
              </div>
            ) : (
              <span />
            )}
            <Button
              type="submit"
              className="h-11 rounded-none border-2 border-ink bg-blue px-5 text-base font-black shadow-[3px_3px_0_#111] hover:bg-blue/90"
            >
              {isEdit ? 'Save changes' : 'Add to timeline'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type AccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  configured: boolean;
  authMode: 'signin' | 'signup';
  setAuthMode: (mode: 'signin' | 'signup') => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  authError: string;
  authBusy: boolean;
  syncStatus: SyncStatus;
  onAuth: (event: SyntheticEvent<HTMLFormElement>) => void;
  onGoogle: () => void;
  onReset: () => void;
  onSignOut: () => void;
  onExport: () => void;
  onImport: () => void;
};

function AccountDialog(props: AccountDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="rounded-none border-2 border-ink p-0 shadow-[7px_7px_0_#111] sm:max-w-[480px]">
        <DialogHeader className="border-b-2 border-ink p-5 pr-14">
          <DialogTitle className="text-2xl font-black tracking-[-0.04em]">
            {props.user ? 'Your Daymark account' : 'Keep your timeline safe'}
          </DialogTitle>
          <DialogDescription className="font-medium">
            {props.user
              ? 'Your entries can follow you between devices.'
              : 'Device-only mode works now. Sign in when you want free cross-device sync.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 p-5">
          {props.user ? (
            <>
              <div className="account-card">
                <span className="grid size-10 place-items-center border-2 border-ink bg-sun">
                  <CircleUserRound />
                </span>
                <div>
                  <strong>{props.user.displayName || 'Daymark account'}</strong>
                  <span>{props.user.email}</span>
                </div>
              </div>
              <SyncIndicator
                status={props.syncStatus}
                hasAccount
                className="flex border-2 border-ink p-4"
              />
            </>
          ) : props.configured ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-none border-2 border-ink font-black"
                onClick={props.onGoogle}
                disabled={props.authBusy}
              >
                <span className="google-g">G</span> Continue with Google
              </Button>
              <div className="auth-divider">
                <span>or use email</span>
              </div>
              <form className="space-y-3" onSubmit={props.onAuth}>
                <label className="auth-field" htmlFor="account-email">
                  <span>Email</span>
                  <Input
                    id="account-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={props.email}
                    onChange={(event) => props.setEmail(event.target.value)}
                  />
                </label>
                <label className="auth-field" htmlFor="account-password">
                  <span>Password</span>
                  <Input
                    id="account-password"
                    type="password"
                    minLength={6}
                    autoComplete={
                      props.authMode === 'signin'
                        ? 'current-password'
                        : 'new-password'
                    }
                    required
                    value={props.password}
                    onChange={(event) => props.setPassword(event.target.value)}
                  />
                </label>
                {props.authError && (
                  <p className="form-error" role="alert">
                    {props.authError}
                  </p>
                )}
                <Button
                  type="submit"
                  className="h-11 w-full rounded-none border-2 border-ink bg-blue font-black shadow-[3px_3px_0_#111]"
                  disabled={props.authBusy}
                >
                  {props.authBusy && <LoaderCircle className="animate-spin" />}
                  {props.authMode === 'signin'
                    ? 'Sign in'
                    : 'Create free account'}
                </Button>
              </form>
              <div className="flex items-center justify-between gap-3 text-xs font-bold">
                <button
                  className="underline underline-offset-4"
                  onClick={() =>
                    props.setAuthMode(
                      props.authMode === 'signin' ? 'signup' : 'signin',
                    )
                  }
                >
                  {props.authMode === 'signin'
                    ? 'Create an account'
                    : 'I already have an account'}
                </button>
                {props.authMode === 'signin' && (
                  <button
                    className="underline underline-offset-4"
                    onClick={props.onReset}
                  >
                    Reset password
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="border-2 border-ink bg-sun/35 p-4">
              <strong className="block font-black">
                Cloud sync is ready to connect.
              </strong>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                Add a free Firebase project using the included FIREBASE_SETUP
                guide. Until then, everything stays on this device.
              </p>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.14em]">
              Your data
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-11 rounded-none border-2 border-ink font-black"
                onClick={props.onExport}
              >
                <Download /> Export backup
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-none border-2 border-ink font-black"
                onClick={props.onImport}
              >
                <FileUp /> Import backup
              </Button>
            </div>
          </div>

          {props.user && (
            <Button
              variant="ghost"
              className="h-10 w-full font-black text-destructive"
              onClick={props.onSignOut}
            >
              <LogOut /> Sign out
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function mergeEntry(entries: TimelineEntry[], entry: TimelineEntry) {
  const existingIndex = entries.findIndex((item) => item.id === entry.id);
  if (existingIndex === -1) return [...entries, entry];
  const next = [...entries];
  next[existingIndex] = entry;
  return next;
}

function makeId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function firstNameOrEmail(user: User) {
  return (
    user.displayName?.split(' ')[0] || user.email?.split('@')[0] || 'Account'
  );
}

function readableAuthError(error: unknown) {
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String(error.code)
      : '';
  if (code.includes('invalid-credential'))
    return 'That email or password did not match.';
  if (code.includes('email-already-in-use'))
    return 'An account already uses that email.';
  if (code.includes('weak-password'))
    return 'Choose a password with at least six characters.';
  if (code.includes('popup-closed'))
    return 'The sign-in window was closed before finishing.';
  if (code.includes('network-request-failed'))
    return 'Could not reach the sync service. Check your connection.';
  return 'Something went wrong while signing in. Please try again.';
}

function mergeReflection(
  reflections: DailyReflection[],
  next: DailyReflection,
) {
  return [
    ...reflections.filter((reflection) => reflection.date !== next.date),
    next,
  ].sort((a, b) => a.date.localeCompare(b.date));
}

function hasReflectionContent(
  reflection: DailyReflection | null | undefined,
): reflection is DailyReflection {
  return Boolean(
    reflection &&
    (reflection.biggestWin ||
      reflection.tomorrowFocus ||
      typeof reflection.wakeMinute === 'number' ||
      typeof reflection.sleepMinute === 'number'),
  );
}

function formatBoundaryTime(minute: number) {
  const nextDay = minute >= 24 * 60;
  const clockMinute = minute % (24 * 60);
  return `${formatTime(clockMinute)}${nextDay ? ' next day' : ''}`;
}

function dayMarkerIntent(input: string): DayMarkerKind | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;

  if (
    /\b(?:woke\s+up|wake\s+up|got\s+up|up\s+for\s+the\s+day|start(?:ed|ing)?\s+(?:my|the)\s+day|awake\s+for\s+the\s+day)\b/.test(
      value,
    )
  ) {
    return 'wake';
  }

  if (
    /\b(?:went\s+to\s+(?:bed|sleep)|go(?:ing)?\s+to\s+(?:bed|sleep)|fell\s+asleep|bedtime|sleep\s+time|calling\s+it\s+a\s+night)\b/.test(
      value,
    )
  ) {
    return 'sleep';
  }

  return null;
}

function startOfWeekKey(key: string) {
  const date = dateFromKey(key);
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  return dateKey(date);
}

function findTimelineGaps(
  entries: TimelineEntry[],
  startBoundary: number,
  endBoundary: number,
) {
  const gaps: Array<{ start: number; end: number }> = [];
  if (endBoundary <= startBoundary) return gaps;
  let cursor = startBoundary;
  for (const entry of entries) {
    if (entry.endMinute <= startBoundary) continue;
    const gapEnd = Math.min(entry.startMinute, endBoundary);
    if (gapEnd - cursor >= 30) gaps.push({ start: cursor, end: gapEnd });
    cursor = Math.max(cursor, entry.endMinute);
    if (cursor >= endBoundary) return gaps;
  }
  if (endBoundary - cursor >= 30)
    gaps.push({ start: cursor, end: endBoundary });
  return gaps;
}
