import React, { useEffect, useMemo, useState, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { Sun, Trash2, Edit2, PlusCircle } from 'lucide-react'
// Firebase
import { db, auth, googleProvider } from './firebase'
import { collection, query, where, getDocs, setDoc, doc, deleteDoc, onSnapshot, getDoc } from 'firebase/firestore'
import { signInWithPopup, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth'

// New App.jsx implements multi-profile support, per-profile workouts, templates, PRs, rest timer, import/export, edit/delete, and migration

const STORAGE_KEY = 'fitnessTrackerStore' // new combined key
const LEGACY_KEY = 'fitnessTrackerWorkouts' // old key to migrate

const TABS = ['Log Workout', 'History', 'Progress', 'Body Analysis', 'TBD', 'TBD', 'Records', 'Templates']

function uid(prefix = ''){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,8) }

function timeOfDay(date = new Date()){
  const h = new Date(date).getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

export default function App(){
  // Profiles and workspace
  const [profiles, setProfiles] = useState([])
  const [currentProfileId, setCurrentProfileId] = useState(null)
  // Map profileId -> workouts[]
  const [profileWorkouts, setProfileWorkouts] = useState({})
  // Map profileId -> templates[]
  const [profileTemplates, setProfileTemplates] = useState({})

  const [tab, setTab] = useState('Log Workout')
  const [showProfileSelector, setShowProfileSelector] = useState(false)
  const [showProfileDetails, setShowProfileDetails] = useState(false)
  // selectedProfile controls initial flow: must select before accessing app
  const [selectedProfile, setSelectedProfile] = useState(null)
  // Firebase user & loading
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const savingWorkoutsRef = useRef(new Set())
  const unsubscribesRef = useRef([])
  const intendedAuthActionRef = useRef(null) // 'signup' | 'signin' or null
  const [saving, setSaving] = useState(false)
  const [authIntent, setAuthIntent] = useState(null) // 'signup' or 'signin'

  // Form state (we implement form here to support edit/update easily)
  const [type, setType] = useState('gym')
  const [form, setForm] = useState({ exercise:'', bodyPart:'Chest', sets:'', reps:'', weight:'', duration:'', notes:'', feeling:'good', cardioType:'running', distance:'', time:'' })
  const [editWorkoutId, setEditWorkoutId] = useState(null)

  // Template UI
  const [templateName, setTemplateName] = useState('')

  // Rest timer
  const [timerOpen, setTimerOpen] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(60)
  const [timeLeft, setTimeLeft] = useState(0)
  const timerRef = useRef(null)

  // UI toasts
  const [toasts, setToasts] = useState([])
  function toast(msg){
    const id = uid('toast-')
    setToasts(t => [...t, { id, msg }])
    setTimeout(()=> setToasts(t => t.filter(x => x.id !== id)), 3500)
  }

  // Derived current profile workouts
  // Always expose workouts sorted newest-first for history display
  const sortedWorkoutsDesc = useMemo(()=>{
    const list = (profileWorkouts[currentProfileId] || []).slice()
    list.sort((a,b)=> new Date(b.date) - new Date(a.date))
    return list
  }, [profileWorkouts, currentProfileId])
  const currentWorkouts = sortedWorkoutsDesc

  // Records (PRs) per profile: exercise -> { weight, date, workoutId }
  const records = useMemo(()=>{
    const rec = {}
    const list = currentWorkouts.slice().reverse() // chronological
    list.forEach(w => {
      if (w.type !== 'gym') return
      const ex = (w.exercise || '').trim()
      const wweight = Number(w.weight) || 0
      if (!ex) return
      if (!rec[ex] || wweight > rec[ex].weight){
        rec[ex] = { weight: wweight, date: w.date, workoutId: w.id }
      }
    })
    return rec
  }, [currentWorkouts])

  // Load and migrate storage on mount
  // Load localStorage only when no user is signed in (keep local fallback)
  useEffect(()=>{
    if (user) return
    try{
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw){
        const parsed = JSON.parse(raw)
        setProfiles(parsed.profiles || [])
        setCurrentProfileId(parsed.currentProfileId || (parsed.profiles && parsed.profiles[0] && parsed.profiles[0].id))
        setProfileWorkouts(parsed.profileWorkouts || {})
        setProfileTemplates(parsed.profileTemplates || {})
      } else {
        // create a starter profile when no local data exists
        const id = uid('profile-')
        const starter = { id, name: 'Me', color: '#7c3aed', emoji: '💪', createdAt: new Date().toISOString() }
        setProfiles([starter])
        setCurrentProfileId(id)
        setProfileWorkouts({ [id]: [] })
        setProfileTemplates({ [id]: [] })
        // Save
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles:[starter], currentProfileId:id, profileWorkouts:{ [id]: [] }, profileTemplates:{ [id]: [] } }))
    }
    }catch(e){
      console.error('Error loading storage', e)
    }
  }, [user])

  // Auth listener: set user and fetch Firestore data when signed in
  useEffect(()=>{
    setAuthLoading(true)
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u)
      setAuthLoading(false)
      // cleanup previous listeners
      if (unsubscribesRef.current.length){
        unsubscribesRef.current.forEach(fn => { try{ fn() }catch(e){} })
        unsubscribesRef.current = []
      }
      if (u){
        try{
          setLoading(true)
          // realtime profiles listener
          const pq = query(collection(db, 'profiles'), where('userId', '==', u.uid))
          const unsubProfiles = onSnapshot(pq, async (snapshot) => {
            console.log('[onSnapshot] profiles updated, count=', snapshot.docs.length)
            const profs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
              setProfiles(profs)
              const firstId = profs[0]?.id || null
              setCurrentProfileId(firstId)
              // If no profile is currently selected, auto-select the first profile so the app proceeds
              if (!selectedProfile && profs.length > 0){
                setSelectedProfile(profs[0])
              }

              // If this is a newly signed-in user with no profiles, create a starter profile in Firestore
              if (profs.length === 0 && u){
                try{
                  const newId = uid('profile-')
                  const starter = { id: newId, name: 'Me', color: '#7c3aed', emoji: '💪', createdAt: new Date().toISOString(), userId: u.uid }
                  await setDoc(doc(db, 'profiles', newId), { name: starter.name, color: starter.color, emoji: starter.emoji, createdAt: starter.createdAt, userId: u.uid })
                  // set locally so UI can proceed immediately (snapshot will also update)
                  setProfiles([starter])
                  setCurrentProfileId(newId)
                  setSelectedProfile(starter)
                }catch(err){ console.error('Failed to create starter profile', err) }
              }

            // cleanup any existing workout listeners
            if (unsubscribesRef.current.length){
              unsubscribesRef.current.forEach(fn => { try{ fn() }catch(e){} })
              unsubscribesRef.current = []
            }

            // for each profile, attach workouts snapshot
            for (const p of profs){
              const wq = query(collection(db, 'workouts'), where('profileId', '==', p.id), where('userId', '==', u.uid))
              const unsubW = onSnapshot(wq, (wsnap) => {
                console.log(`[onSnapshot] workouts for profile ${p.id} count=`, wsnap.docs.length)
                const data = wsnap.docs.map(d => ({ id: d.id, ...d.data() }))
                // ensure newest-first order locally
                data.sort((a,b)=> new Date(b.date) - new Date(a.date))
                setProfileWorkouts(prev => ({ ...prev, [p.id]: data }))
              }, (err) => { console.error('workouts snapshot error', err); setError('Failed to sync workouts') })
              unsubscribesRef.current.push(unsubW)
            }

            // templates (one-time fetch)
            try{
              const tmap = {}
              const tq = query(collection(db, 'templates'), where('userId', '==', u.uid))
              const tsnap = await getDocs(tq)
              tsnap.docs.forEach(d => {
                const data = d.data()
                const pid = data.profileId
                if (!tmap[pid]) tmap[pid] = []
                tmap[pid].push({ id: d.id, ...data })
              })
              setProfileTemplates(tmap)
            }catch(e){ console.error('Failed to load templates', e) }
          }, (err) => { console.error('profiles snapshot error', err); setError('Failed to sync profiles') })
          unsubscribesRef.current.push(unsubProfiles)
        }catch(err){
          console.error('Firestore init failed', err)
          setError('Failed to load cloud data')
        }finally{ setLoading(false) }
      } else {
        // user signed out: clear cloud data
        setProfiles([])
        setProfileWorkouts({})
        setProfileTemplates({})
      }
    })
    return () => {
      try{ unsub() }catch(e){}
      if (unsubscribesRef.current.length){ unsubscribesRef.current.forEach(fn => { try{ fn() }catch(e){} }) }
    }
  }, [])

  // Sign in with Google
  async function signInWithGoogle(){
    // legacy: default signin
    return signInWithGoogleIntent('signin')
  }

  async function signInWithGoogleIntent(action = 'signin'){
    try{
      intendedAuthActionRef.current = action
      setAuthIntent(action)
      setLoading(true)
      await signInWithPopup(auth, googleProvider)
      toast(action === 'signup' ? 'Signed in (signup)' : 'Signed in')
    }catch(err){ console.error(err); setError('Sign-in failed'); toast('Sign-in failed') }finally{ setLoading(false); intendedAuthActionRef.current = null }
  }

  // expose a simple global bridge for the ProfileSelectionScreen sign-in button
  useEffect(()=>{
    window.__FT_SIGNIN = (action) => signInWithGoogleIntent(action)
    return () => { try{ delete window.__FT_SIGNIN }catch(e){} }
  }, [])

  async function signOut(){
    try{
      setLoading(true)
      await firebaseSignOut(auth)
      // clear selected profile so the sign-in screen appears
      setSelectedProfile(null)
      setCurrentProfileId(null)
      setProfiles([])
      setProfileWorkouts({})
      setProfileTemplates({})
      toast('Signed out')
    }catch(e){ console.error(e); toast('Sign out failed') }
    finally{ setLoading(false) }
  }

  // One-time migration from localStorage into Firestore under current user
  async function migrateLocalToCloud(){
    if (!user) return alert('Sign in first to migrate')
    if (!confirm('Migrate local data to your cloud account? This will NOT delete local data automatically.')) return
    try{
      setLoading(true)
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return alert('No local data found')
      const parsed = JSON.parse(raw)
      // upload profiles
      for (const p of (parsed.profiles||[])){
        await setDoc(doc(db, 'profiles', p.id), { name: p.name, emoji: p.emoji, color: p.color, createdAt: p.createdAt || new Date().toISOString(), userId: user.uid })
      }
      // upload workouts
      for (const [pid, arr] of Object.entries(parsed.profileWorkouts || {})){
        for (const w of (arr||[])){
          await setDoc(doc(db, 'workouts', w.id), { ...w, profileId: pid, userId: user.uid })
        }
      }
      // upload templates
      for (const [pid, arr] of Object.entries(parsed.profileTemplates || {})){
        for (const t of (arr||[])){
          await setDoc(doc(db, 'templates', t.id), { ...t, profileId: pid, userId: user.uid })
        }
      }
      toast('Migration complete!')
    }catch(err){ console.error(err); alert('Migration failed') }
    finally{ setLoading(false) }
  }

  // Save storage whenever core pieces change
  // When user is NOT signed in, persist to localStorage as fallback. When signed in, Firestore operations are used per action.
  useEffect(()=>{
    if (user) return
    try{
      const payload = { profiles, currentProfileId, profileWorkouts, profileTemplates }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    }catch(e){
      console.error('Error saving storage', e)
    }
  }, [profiles, currentProfileId, profileWorkouts, profileTemplates, user])

  // CRUD: add/update/delete workout for current profile
  async function addWorkoutForCurrent(w){
    const id = uid('w-')
    const payload = { ...w, id, date: new Date().toISOString(), timeOfDay: timeOfDay() }
    if (user){
      // prevent duplicates per id
      if (savingWorkoutsRef.current.has(id)){
        console.log('Skipping add; already saving', id)
        return
      }
      savingWorkoutsRef.current.add(id)
      setSaving(true)
      setLoading(true)
      try{
        console.log('Attempting to save workout', id)
        const existing = await getDoc(doc(db, 'workouts', id))
        if (existing.exists()){
          console.log('Workout exists, skipping', id)
          toast('Workout already exists, skipped')
          return
        }
        await setDoc(doc(db, 'workouts', id), { ...payload, profileId: currentProfileId, userId: user.uid })
        // optimistic update
        setProfileWorkouts(pw => {
          const list = pw[currentProfileId] || []
          if (list.some(x => x.id === id)) return pw
          return { ...pw, [currentProfileId]: [payload, ...list] }
        })
        console.log('Workout saved', id)
        toast('Workout added (cloud)')
      }catch(err){ console.error('Error saving workout', err); toast('Failed to save workout') }
      finally{ savingWorkoutsRef.current.delete(id); setSaving(false); setLoading(false) }
    } else {
      setProfileWorkouts(pw => ({ ...pw, [currentProfileId]: [payload, ...(pw[currentProfileId] || [])] }))
      toast('Workout added')
    }
  }

  async function updateWorkoutForCurrent(updated){
    if (user){
      setSaving(true)
      setLoading(true)
      try{
        console.log('Updating workout', updated.id)
        await setDoc(doc(db, 'workouts', updated.id), { ...updated, profileId: currentProfileId, userId: user.uid })
        setProfileWorkouts(pw => ({ ...pw, [currentProfileId]: (pw[currentProfileId] || []).map(w => w.id === updated.id ? { ...w, ...updated } : w) }))
        toast('Workout updated (cloud)')
      }catch(err){ console.error('Failed to update workout', err); toast('Failed to update') }
      finally{ setSaving(false); setLoading(false) }
    } else {
      setProfileWorkouts(pw => ({ ...pw, [currentProfileId]: (pw[currentProfileId] || []).map(w => w.id === updated.id ? { ...w, ...updated } : w) }))
      toast('Workout updated')
    }
  }

  async function deleteWorkoutForCurrent(id){
    if (!confirm('Delete this workout? This cannot be undone.')) return
    if (user){
      setSaving(true)
      setLoading(true)
      try{
        await deleteDoc(doc(db, 'workouts', id))
        setProfileWorkouts(pw => ({ ...pw, [currentProfileId]: (pw[currentProfileId] || []).filter(w => w.id !== id) }))
        toast('Workout deleted (cloud)')
      }catch(err){ console.error('Failed to delete workout', err); toast('Failed to delete') }
      finally{ setSaving(false); setLoading(false) }
    } else {
      setProfileWorkouts(pw => ({ ...pw, [currentProfileId]: (pw[currentProfileId] || []).filter(w => w.id !== id) }))
      toast('Workout deleted')
    }
  }

  // Profiles: add / select
  function createProfile(name, color, emoji){
    const id = uid('profile-')
    const p = { id, name, color, emoji, createdAt: new Date().toISOString() }
    if (user){
      // Enforce one profile per authenticated user
      if (profiles && profiles.length > 0){
        return alert('Your account already has a profile')
      }
      setLoading(true)
      setDoc(doc(db, 'profiles', id), { name, color, emoji, createdAt: p.createdAt, userId: user.uid }).then(()=>{
        setProfiles([p])
        setProfileWorkouts(pw => ({ ...pw, [id]: [] }))
        setProfileTemplates(pt => ({ ...pt, [id]: [] }))
        setCurrentProfileId(id)
        setSelectedProfile(p)
        setShowProfileSelector(false)
        toast('Welcome — profile created')
      }).catch(err=>{ console.error(err); toast('Failed to create profile') }).finally(()=>setLoading(false))
    } else {
      // local fallback (not signed in)
      setProfiles(ps => [...ps, p])
      setProfileWorkouts(pw => ({ ...pw, [id]: [] }))
      setProfileTemplates(pt => ({ ...pt, [id]: [] }))
      setCurrentProfileId(id)
      setSelectedProfile(p)
      setShowProfileSelector(false)
      toast('Profile created (local)')
    }
  }

  function switchProfile(id){
    setCurrentProfileId(id)
    setShowProfileSelector(false)
    toast('Switched profile')
  }

  // Delete profile (cloud + local). Removes workouts and templates for the profile and then the profile doc.
  async function deleteProfile(profileId){
    if (!profileId) return
    if (profiles.length <= 1) return alert('You must have at least one profile')
    const profile = profiles.find(p => p.id === profileId)
    if (!profile) return
    const confirmed = confirm(`Delete profile "${profile.name}" and all its data? This cannot be undone.`)
    if (!confirmed) return
    try{
      setLoading(true)
      // Delete workouts
      if (user){
        const wq = query(collection(db, 'workouts'), where('profileId', '==', profileId), where('userId', '==', user.uid))
        const wsnap = await getDocs(wq)
        const delW = wsnap.docs.map(d => deleteDoc(d.ref))
        await Promise.all(delW)
        // Delete templates
        const tq = query(collection(db, 'templates'), where('profileId', '==', profileId), where('userId', '==', user.uid))
        const tsnap = await getDocs(tq)
        const delT = tsnap.docs.map(d => deleteDoc(d.ref))
        await Promise.all(delT)
        // Delete profile doc
        await deleteDoc(doc(db, 'profiles', profileId))
      }
      // Local state cleanup
      setProfiles(ps => ps.filter(p=>p.id !== profileId))
      setProfileWorkouts(pw => { const copy = { ...pw }; delete copy[profileId]; return copy })
      setProfileTemplates(pt => { const copy = { ...pt }; delete copy[profileId]; return copy })
      if (currentProfileId === profileId){
        setCurrentProfileId(null)
        setSelectedProfile(null)
      }
      toast('Profile deleted')
    }catch(err){ console.error('Failed to delete profile', err); alert('Failed to delete profile') }
    finally{ setLoading(false) }
  }

  // Export all profiles and workouts
  function exportAll(){
    try{
      const payload = { profiles, currentProfileId, profileWorkouts, profileTemplates }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'fitnessTrackerBackup.json'
      a.click()
      URL.revokeObjectURL(url)
      toast('Exported data')
    }catch(e){ console.error(e); toast('Export failed') }
  }

  // Import: ask user to merge or replace
  function importAll(file){
    const reader = new FileReader()
    reader.onload = () => {
      try{
        const parsed = JSON.parse(reader.result)
        if (!parsed || !parsed.profiles) return alert('Invalid backup file')
        const replace = confirm('Replace existing data with imported data? OK=Replace, Cancel=Merge')
        if (replace){
          setProfiles(parsed.profiles || [])
          setCurrentProfileId(parsed.currentProfileId || (parsed.profiles && parsed.profiles[0] && parsed.profiles[0].id))
          setProfileWorkouts(parsed.profileWorkouts || {})
          setProfileTemplates(parsed.profileTemplates || {})
          toast('Imported (replaced)')
        } else {
          // Merge: avoid id collisions
          const existingIds = new Set(profiles.map(p=>p.id))
          const newProfiles = parsed.profiles.filter(p => !existingIds.has(p.id))
          const mergedProfiles = [...profiles, ...newProfiles]
          const mergedWorkouts = { ...profileWorkouts }
          Object.entries(parsed.profileWorkouts || {}).forEach(([pid, arr]) => {
            if (!mergedWorkouts[pid]) mergedWorkouts[pid] = arr
            else mergedWorkouts[pid] = [...arr.filter(a => !mergedWorkouts[pid].some(e=>e.id===a.id)), ...mergedWorkouts[pid]]
          })
          const mergedTemplates = { ...profileTemplates, ...(parsed.profileTemplates||{}) }
          setProfiles(mergedProfiles)
          setProfileWorkouts(mergedWorkouts)
          setProfileTemplates(mergedTemplates)
          toast('Imported (merged)')
        }
      }catch(e){ console.error(e); alert('Failed to import') }
    }
    reader.readAsText(file)
  }

  // Form submit handler (add or update)
  async function handleSubmit(e){
    e.preventDefault()
    // basic validation
    if (type === 'gym'){
      if (!form.exercise) return alert('Exercise required')
      if (!form.sets) return alert('Sets required')
      if (!form.reps) return alert('Reps required')
    }
    const payload = { ...form, type }
    if (editWorkoutId){
      await updateWorkoutForCurrent({ ...payload, id: editWorkoutId })
      setEditWorkoutId(null)
    } else {
      await addWorkoutForCurrent(payload)
    }
    // reset form (keep bodyPart/feeling)
    setForm({ exercise:'', bodyPart:form.bodyPart||'Chest', sets:'', reps:'', weight:'', duration:'', notes:'', feeling:form.feeling||'good', cardioType:'running', distance:'', time:'' })
    setTab('History')
  }

  // Start editing a workout: prefill form and switch to Log tab
  function startEditWorkout(workout){
    setType(workout.type || 'gym')
    setForm({ exercise: workout.exercise || '', bodyPart: workout.bodyPart || 'Chest', sets: workout.sets || '', reps: workout.reps || '', weight: workout.weight || '', duration: workout.duration || '', notes: workout.notes || '', feeling: workout.feeling || 'good', cardioType: workout.cardioType || 'running', distance: workout.distance || '', time: workout.time || '' })
    setEditWorkoutId(workout.id)
    setTab('Log Workout')
  }

  // Templates per profile: save current form as template
  function saveTemplate(name){
    if (!name) return alert('Template name required')
    const t = { id: uid('tpl-'), name, exercises: [ { ...form, type } ] }
    setProfileTemplates(pt => ({ ...pt, [currentProfileId]: [ ...(pt[currentProfileId]||[]), t ] }))
    setTemplateName('')
    toast('Template saved')
  }

  function loadTemplate(t){
    // fill form with first exercise in template
    const ex = (t.exercises && t.exercises[0]) || null
    if (!ex) return
    setType(ex.type || 'gym')
    setForm({ exercise: ex.exercise || '', bodyPart: ex.bodyPart || 'Chest', sets: ex.sets || '', reps: ex.reps || '', weight: ex.weight || '', duration: ex.duration || '', notes: ex.notes || '', feeling: ex.feeling || 'good', cardioType: ex.cardioType || 'running', distance: ex.distance || '', time: ex.time || '' })
    toast('Template loaded')
  }

  // Rest timer helpers
  function startTimer(seconds){
    setTimeLeft(seconds)
    setTimerOpen(true)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(()=>{
      setTimeLeft(t => {
        if (t <= 1){
          clearInterval(timerRef.current)
          timerRef.current = null
          // notify
          try{
            if (window.Notification && Notification.permission === 'granted') new Notification('Rest timer finished')
            else if (window.Notification && Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p==='granted') new Notification('Rest timer finished') })
          }catch(e){ console.warn('Notification failed', e) }
          toast('Timer finished')
          return 0
        }
        return t - 1
      })
    }, 1000)
  }

  function stopTimer(){ if (timerRef.current) clearInterval(timerRef.current); timerRef.current = null; setTimerOpen(false); setTimeLeft(0) }

  // UI helpers
  const currentProfile = profiles.find(p => p.id === currentProfileId) || null
  // If no profile has been chosen yet, present full-screen ProfileSelectionScreen
  if (!selectedProfile){
    return (
      <ProfileSelectionScreen
        profiles={profiles}
        profileWorkouts={profileWorkouts}
        onCreate={(name,color,emoji)=>createProfile(name,color,emoji)}
        onSelectProfile={(p)=>{ setSelectedProfile(p); setCurrentProfileId(p.id) }}
        user={user}
        authLoading={authLoading}
        authIntent={authIntent}
        setAuthIntent={setAuthIntent}
      />
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      
      {/* Profile selector overlay */}
      {showProfileSelector && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
          <div className="bg-slate-800 p-6 rounded-md w-11/12 max-w-3xl">
            <h2 className="text-xl font-semibold mb-4">Select Profile</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {profiles.map(p => (
                <div key={p.id} className="p-3 rounded-md" style={{ background: p.color }}>
                  <div className="text-2xl">{p.emoji}</div>
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm">{(profileWorkouts[p.id]||[]).length} workouts</div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => switchProfile(p.id)} className="px-2 py-1 bg-white/10 rounded-md">Select</button>
                  </div>
                </div>
              ))}
              {/* removed AddProfileForm to enforce one profile per account */}
            </div>
            <div className="flex justify-end">
                <button onClick={()=>setShowProfileSelector(false)} className="px-3 py-2 bg-slate-100 text-slate-800 rounded-md">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Profile details modal */}
      {showProfileDetails && currentProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-6 w-80">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: currentProfile.color }}>{currentProfile.emoji}</div>
              <div>
                <div className="font-semibold">{currentProfile.name}</div>
                <div className="text-sm text-slate-500">{user ? user.email : ''}</div>
              </div>
            </div>
            <div className="mb-4">Coming soon! Personal details and settings will be available here.</div>
            <div className="flex justify-end">
              <button onClick={()=>setShowProfileDetails(false)} className="px-3 py-2 bg-slate-100 rounded-md">Close</button>
            </div>
          </div>
        </div>
      )}

      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Fitness Workout Tracker</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* profile switcher */}
          {currentProfile && (
            <div className="flex items-center gap-2">
              <button onClick={()=>setShowProfileDetails(true)} className="flex items-center gap-2 glass p-2 rounded-md" style={{ borderColor: currentProfile.color }}>
                <span style={{ background: currentProfile.color }} className="w-6 h-6 flex items-center justify-center rounded-full">{currentProfile.emoji}</span>
                <span className="font-medium">{currentProfile.name}</span>
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            {loading && <div className="px-2 py-1 text-sm bg-yellow-500/20 rounded-md">Syncing...</div>}
            {error && <div className="px-2 py-1 text-sm bg-red-500/20 rounded-md">{error}</div>}
            {user ? (
              <div className="flex items-center gap-2">
                <div className="text-sm">{user.email}</div>
                <button onClick={signOut} className="px-2 py-1 bg-red-600 rounded-md text-sm">Sign Out</button>
              </div>
            ) : (
              <button onClick={signInWithGoogle} className="glass p-2 rounded-md"><Sun className="w-5 h-5 text-yellow-300"/></button>
            )}
          </div>
        </div>
      </header>

      <nav className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-md glass transition-smooth ${tab===t? 'ring-2':''}`} style={currentProfile? { boxShadow: `0 0 0 2px ${currentProfile.color}22` } : {}}>
            {(t === 'Records' || t === 'Templates') ? 'TBD' : t}
          </button>
        ))}
      </nav>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          {tab === 'Log Workout' && (
            <div className="glass p-4 rounded-md">
              <h2 className="text-xl font-semibold mb-3">{editWorkoutId ? 'Edit Workout' : 'Log Workout'}</h2>
              <div className="flex gap-2 mb-4">
                <button onClick={()=>setType('gym')} className={`px-3 py-2 rounded-md ${type==='gym' ? 'bg-sky-400 text-white':''}`}>Gym</button>
                <button onClick={()=>setType('cardio')} className={`px-3 py-2 rounded-md ${type==='cardio' ? 'bg-sky-400 text-white':''}`}>Cardio</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {type === 'gym' ? (
                  <>
                    <div>
                      <label className="block text-sm">Exercise name *</label>
                      <input value={form.exercise} onChange={e=>setForm({...form, exercise:e.target.value})} className="w-full mt-1 p-2 rounded-md bg-transparent border border-white/10" />
                    </div>

                    <div>
                      <label className="block text-sm">Body part</label>
                      <select value={form.bodyPart} onChange={e=>setForm({...form, bodyPart:e.target.value})} className="w-full mt-1 p-2 rounded-md bg-transparent border border-white/10">
                        <option>Chest</option>
                        <option>Back</option>
                        <option>Shoulders</option>
                        <option>Arms</option>
                        <option>Legs</option>
                        <option>Core</option>
                        <option>Full Body</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <input value={form.sets} onChange={e=>setForm({...form, sets:e.target.value})} placeholder="Sets *" className="p-2 rounded-md bg-transparent border border-white/10" />
                      <input value={form.reps} onChange={e=>setForm({...form, reps:e.target.value})} placeholder="Reps *" className="p-2 rounded-md bg-transparent border border-white/10" />
                      <input value={form.weight} onChange={e=>setForm({...form, weight:e.target.value})} placeholder="Weight" className="p-2 rounded-md bg-transparent border border-white/10" />
                    </div>

                    <div>
                      <label className="block text-sm">Duration (min)</label>
                      <input value={form.duration} onChange={e=>setForm({...form, duration:e.target.value})} className="w-full mt-1 p-2 rounded-md bg-transparent border border-white/10" />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm">Type</label>
                      <select value={form.cardioType} onChange={e=>setForm({...form, cardioType:e.target.value})} className="w-full mt-1 p-2 rounded-md bg-transparent border border-white/10">
                        <option value="running">Running</option>
                        <option value="cycling">Cycling</option>
                        <option value="swimming">Swimming</option>
                        <option value="walking">Walking</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input value={form.distance} onChange={e=>setForm({...form, distance:e.target.value})} placeholder="Distance (km)" className="p-2 rounded-md bg-transparent border border-white/10" />
                      <input value={form.time} onChange={e=>setForm({...form, time:e.target.value})} placeholder="Time (min)" className="p-2 rounded-md bg-transparent border border-white/10" />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm">Notes</label>
                  <textarea value={form.notes} onChange={e=>setForm({...form, notes:e.target.value})} className="w-full mt-1 p-2 rounded-md bg-transparent border border-white/10" />
                </div>

                <div>
                  <label className="block text-sm mb-1">Feeling</label>
                  <div className="flex gap-2">
                    {['excellent','good','okay','tired'].map(f => (
                      <button key={f} type="button" onClick={()=>setForm({...form, feeling:f})} className={`px-3 py-1 rounded-full ${form.feeling===f? 'ring-2 ring-white':''} ${f==='excellent'?'bg-green-500':f==='good'?'bg-blue-500':f==='okay'?'bg-yellow-500':'bg-red-500'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="px-4 py-2 bg-sky-400 text-white rounded-md" type="submit">{editWorkoutId ? 'Update Workout' : 'Add Workout'}</button>
                  {editWorkoutId && <button type="button" onClick={() => { setEditWorkoutId(null); setForm({ exercise:'', bodyPart:'Chest', sets:'', reps:'', weight:'', duration:'', notes:'', feeling:'good', cardioType:'running', distance:'', time:'' }) }} className="px-3 py-2 bg-slate-100 text-slate-800 rounded-md">Cancel</button>}
                  <button type="button" onClick={()=>saveTemplate(prompt('Template name')||'')} className="px-3 py-2 bg-slate-100 text-slate-800 rounded-md">Save as Template</button>
                </div>
              </form>
            </div>
          )}

          {tab === 'History' && (
            <div className="space-y-3">
              {currentWorkouts.length === 0 && <div className="glass p-4 rounded-md">No workouts yet</div>}
              {currentWorkouts.map(w => (
                <div key={w.id} className="glass p-4 rounded-md">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold">{w.type==='gym' ? (w.exercise || 'Gym') : (w.cardioType || 'Cardio')}</h3>
                        {records[w.exercise] && records[w.exercise].workoutId === w.id && <span className="px-2 py-1 rounded-full bg-amber-500 text-sm">PR</span>}
                      </div>
                      <div className="text-sm text-slate-300">{new Date(w.date).toLocaleString()} • {w.timeOfDay}</div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={()=>startEditWorkout(w)} className="p-2 rounded-md bg-slate-100 text-slate-800"><Edit2/></button>
                      <button onClick={()=>deleteWorkoutForCurrent(w.id)} className="p-2 rounded-md bg-red-600"><Trash2/></button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                    {w.type === 'gym' ? (
                      <>
                        <div>Body part: {w.bodyPart}</div>
                        <div>Sets x Reps: {w.sets} x {w.reps}</div>
                        <div>Weight: {w.weight}</div>
                      </>
                    ) : (
                      <>
                        <div>Type: {w.cardioType}</div>
                        <div>Distance: {w.distance}</div>
                        <div>Time: {w.time}</div>
                      </>
                    )}
                  </div>

                  {w.notes && <div className="mt-3 text-sm">Notes: {w.notes}</div>}
                </div>
              ))}
            </div>
          )}

          {tab === 'Progress' && (
            <div className="space-y-6">
              <div className="glass p-4 rounded-md">
                <h3 className="text-lg font-medium mb-3">Gym Exercise Progress (Last 10 workouts)</h3>
                <ExerciseProgressChart workouts={currentWorkouts} />
              </div>

              <div className="glass p-4 rounded-md">
                <h3 className="text-lg font-medium mb-3">Cardio Progress</h3>
                <CardioProgressCharts workouts={currentWorkouts} />
              </div>
            </div>
          )}

          {tab === 'Body Analysis' && (
            <div className="glass p-8 rounded-md">
              <h3 className="text-lg font-medium mb-3">Body Analysis</h3>
              <div className="text-sm text-slate-300">Body Analysis - Coming Soon!</div>
            </div>
          )}

          {tab === 'TBD' && (
            <div className="glass p-8 rounded-md">
              <h3 className="text-lg font-medium mb-3">Feature</h3>
              <div className="text-sm text-slate-300">Feature Coming Soon!</div>
            </div>
          )}

          {tab === 'TBD' && (
            <div className="glass p-8 rounded-md">
              <h3 className="text-lg font-medium mb-3">Feature</h3>
              <div className="text-sm text-slate-300">Feature Coming Soon!</div>
            </div>
          )}

          {tab === 'Records' && (
            <div className="glass p-8 rounded-md">
              <h3 className="text-lg font-medium mb-3">Personal Records</h3>
              <div className="text-sm text-slate-300">Coming soon!</div>
            </div>
          )}

          {tab === 'Templates' && (
            <div className="glass p-8 rounded-md">
              <h3 className="text-lg font-medium mb-3">Templates</h3>
              <div className="text-sm text-slate-300">Coming soon!</div>
            </div>
          )}

        </section>

        <aside className="lg:col-span-1 space-y-4">
          <div className="glass p-4 rounded-md">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-300">Profile</div>
                <div className="font-semibold">{currentProfile ? currentProfile.name : '—'}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={exportAll} className="px-3 py-2 bg-sky-400 text-white rounded-md">Export All</button>
                <label className="flex items-center gap-2">
                  <input type="file" accept="application/json" className="hidden" onChange={(e)=> e.target.files && importAll(e.target.files[0])} />
                  <span className="px-3 py-2 bg-slate-100 text-slate-800 rounded-md cursor-pointer">Import</span>
                </label>
                <button onClick={migrateLocalToCloud} className="px-3 py-2 bg-blue-600 rounded-md">Migrate to Cloud</button>
                {currentProfile && (
                  <button onClick={() => deleteProfile(currentProfile.id)} disabled={loading || profiles.length <= 1} className="px-3 py-2 bg-red-600 rounded-md ml-2 disabled:opacity-40">Delete Profile</button>
                )}
              </div>
            </div>
          </div>

          <div className="glass p-4 rounded-md">
            <h3 className="text-lg font-medium mb-3">Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 glass rounded-md">
                <div className="text-sm text-slate-300">Total</div>
                <div className="text-2xl font-bold">{currentWorkouts.length}</div>
              </div>
              <div className="p-3 glass rounded-md">
                <div className="text-sm text-slate-300">This week</div>
                <div className="text-2xl font-bold">{currentWorkouts.filter(w => new Date(w.date) >= new Date(Date.now()-7*24*3600*1000)).length}</div>
              </div>
              <div className="p-3 glass rounded-md">
                <div className="text-sm text-slate-300">Gym</div>
                <div className="text-2xl font-bold">{currentWorkouts.filter(w=>w.type==='gym').length}</div>
              </div>
              <div className="p-3 glass rounded-md">
                <div className="text-sm text-slate-300">Cardio</div>
                <div className="text-2xl font-bold">{currentWorkouts.filter(w=>w.type==='cardio').length}</div>
              </div>
            </div>
          </div>

          {/* Quick Actions removed per request; keeping sidebar compact */}
        </aside>
      </main>

      {/* Floating rest timer */}
      {timerOpen && (
        <div className="fixed right-4 bottom-6 bg-slate-900 p-4 rounded-md glass">
          <div className="text-lg font-semibold">Rest Timer</div>
          <div className="text-2xl">{Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}</div>
            <div className="flex gap-2 mt-2">
            <button onClick={()=>startTimer(30)} className="px-2 py-1 bg-slate-100 text-slate-800 rounded-md">30s</button>
            <button onClick={()=>startTimer(60)} className="px-2 py-1 bg-slate-100 text-slate-800 rounded-md">60s</button>
            <button onClick={()=>startTimer(90)} className="px-2 py-1 bg-slate-100 text-slate-800 rounded-md">90s</button>
            <button onClick={()=>startTimer(120)} className="px-2 py-1 bg-slate-100 text-slate-800 rounded-md">120s</button>
            <button onClick={stopTimer} className="px-2 py-1 bg-red-600 rounded-md">Dismiss</button>
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed left-4 top-4 space-y-2">
        {toasts.map(t => (
          <div key={t.id} className="p-2 bg-black/60 rounded-md">{t.msg}</div>
        ))}
      </div>
    </div>
  )
}

// end of file

// Small helper component for Add Profile form (inline for single-file change)
function AddProfileForm({ onCreate }){
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('💪')
  const [color, setColor] = useState('#7c3aed')
  return (
    <div className="w-full">
      <div className="mb-2">Add Profile</div>
      <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} className="w-full mb-2 p-2 rounded-md bg-transparent border border-white/10" />
      <div className="flex gap-2 mb-2">
        <input value={emoji} onChange={e=>setEmoji(e.target.value)} className="p-2 rounded-md bg-transparent border border-white/10" />
        <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="p-1 rounded-md" />
      </div>
      <div className="flex gap-2">
        <button onClick={()=>{ if (!name) return alert('Name required'); onCreate(name,color,emoji); setName('') }} className="px-3 py-2 bg-green-600 rounded-md">Create</button>
      </div>
    </div>
  )
}
// ExerciseProgressChart: groups workouts by exercise and shows line chart for selected exercise
function ExerciseProgressChart({ workouts }){
  const exercises = useMemo(()=>{
    const map = {}
    // group by exercise name (exact match)
    workouts.forEach(w => {
      if (w.type !== 'gym' || !w.exercise) return
      const key = w.exercise
      if (!map[key]) map[key] = []
      // parse sets/reps/weight robustly (users may enter strings like "3x5" or include units)
      const parseFirstNumber = (v) => {
        if (v == null) return 0
        const n = Number(v)
        if (!Number.isNaN(n)) return n
        const m = String(v).match(/(\d+(?:\.\d+)?)/)
        return m ? Number(m[1]) : 0
      }
      const sets = parseFirstNumber(w.sets)
      const reps = parseFirstNumber(w.reps)
      const weight = parseFirstNumber(w.weight)
      const volume = Number(sets) * Number(reps)
      const totalLoad = Number(weight) * Number(volume)
      map[key].push({ rawDate: new Date(w.date), date: new Date(w.date).toLocaleDateString(), weight: Number(weight), volume: Number(volume), totalLoad: Number(totalLoad) })
    })
    // sort each exercise by date ASC and keep last 10
    Object.keys(map).forEach(k => {
      map[k].sort((a,b)=> a.rawDate - b.rawDate)
      map[k] = map[k].slice(-10)
      if (map[k].length < 2) delete map[k]
    })
    console.log('Exercise chart data prepared', Object.keys(map))
    return map
  }, [workouts])
  const [selected, setSelected] = useState(Object.keys(exercises)[0] || '')
  return (
    <div>
      {Object.keys(exercises).length === 0 && <div className="text-sm text-slate-300">Log 2+ sessions of the same exercise to see charts.</div>}
      {Object.keys(exercises).length > 0 && (
        <>
          <select value={selected} onChange={e=>setSelected(e.target.value)} className="p-2 rounded-md bg-transparent border border-white/10 mb-3">
            {Object.keys(exercises).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          {selected && (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer>
                <LineChart data={exercises[selected]} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Line yAxisId="left" type="monotone" dataKey="weight" stroke="#8884d8" activeDot={{ r: 8 }} name="Weight (lbs)" />
                  <Line yAxisId="right" type="monotone" dataKey="volume" stroke="#ec4899" name="Volume (sets×reps)" />
                  <Line yAxisId="right" type="monotone" dataKey="totalLoad" stroke="#06b6d4" name="Total Load" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Cardio progress charts: per cardio type (running, cycling, etc.) show distance and time/pace
function CardioProgressCharts({ workouts }){
  // Build grouped cardio data by type and provide a dropdown to select one
  const cardioByType = useMemo(()=>{
    const map = {}
    workouts.forEach(w => {
      if (w.type !== 'cardio') return
      const t = (w.cardioType || 'other').toLowerCase()
      if (!map[t]) map[t] = []
      const dist = Number(w.distance) || 0
      const time = Number(w.time) || 0
      const pace = (dist > 0 && time > 0) ? (time / dist) : null
      map[t].push({ rawDate: new Date(w.date), date: new Date(w.date).toLocaleDateString(), distance: dist, time: time, pace })
    })
    Object.keys(map).forEach(k => {
      map[k].sort((a,b)=> a.rawDate - b.rawDate)
      map[k] = map[k].slice(-10)
      if (map[k].length < 2) delete map[k]
    })
    console.log('Cardio chart data prepared', Object.keys(map))
    return map
  }, [workouts])

  const types = Object.keys(cardioByType)
  const [selectedType, setSelectedType] = useState(types[0] || '')

  // keep selectedType in sync if types change
  useEffect(()=>{ if (!types.includes(selectedType)) setSelectedType(types[0]||'') }, [types])

  if (!types || types.length === 0) return <div className="text-sm text-slate-300">Log 2+ cardio sessions to see progress.</div>

  const displayName = selectedType.charAt(0).toUpperCase() + selectedType.slice(1)

  return (
    <div>
      <select value={selectedType} onChange={e=>setSelectedType(e.target.value)} className="p-2 rounded-md bg-transparent border border-white/10 mb-3">
        {types.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
      </select>

      {selectedType && (
        <div className="glass p-4 rounded-md">
          <h4 className="font-semibold mb-2">{displayName} — Last {cardioByType[selectedType].length} sessions</h4>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={cardioByType[selectedType]} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Line yAxisId="left" dataKey="distance" stroke="#8b5cf6" name="Distance (km)" />
                <Line yAxisId="right" dataKey="time" stroke="#ec4899" name="Time (min)" />
                <Line yAxisId="right" dataKey="pace" stroke="#06b6d4" name="Pace (min/km)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

// Full-screen Profile Selection Screen
function ProfileSelectionScreen({ profiles, profileWorkouts, onCreate, onSelectProfile, user, authLoading, authIntent, setAuthIntent }){
  if (authLoading) return <div className="min-h-screen flex items-center justify-center">Checking authentication...</div>

  const [mode, setMode] = useState('choice') // 'choice' | 'signup' | 'signin'
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('💪')
  const [color, setColor] = useState('#7c3aed')

  // initialize mode from global authIntent (signup flow)
  useEffect(()=>{
    if (authIntent === 'signup') setMode('signup')
    if (authIntent === 'signin') setMode('signin')
    // clear intent so it doesn't persist
    setAuthIntent && setAuthIntent(null)
  }, [authIntent, setAuthIntent])

  async function handleSignup(e){
    e && e.preventDefault()
    if (!name) return alert('Please enter a name')
    // use the passed onCreate prop so the component doesn't rely on outer scope
    onCreate && onCreate(name, color, emoji)
    toast(`Welcome, ${name}!`)
  }

  function handleSignin(){
    // existing user sign-in via Google
    window.__FT_SIGNIN && window.__FT_SIGNIN()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg,#f7fbfc,#eef6fb 40%, #e0f2f9 100%)' }}>
      <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-800 mb-2">Fitness Workout Tracker</h1>
          <p className="text-sm text-slate-500 mb-6">One profile per account. Sign up for a new account or sign in if you already have one.</p>

          {mode === 'choice' && (
            <div className="grid grid-cols-2 gap-4">
              <button onClick={()=>setMode('signup')} className="px-4 py-3 bg-sky-400 text-white rounded-lg">Sign up</button>
              <button onClick={()=>setMode('signin')} className="px-4 py-3 bg-white border border-slate-200 rounded-lg">Sign in</button>
            </div>
          )}

          {mode === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-3 text-left">
              <label className="text-sm text-slate-600">Name</label>
              <input value={name} onChange={e=>setName(e.target.value)} className="w-full p-2 border border-slate-200 rounded-md" />
              <label className="text-sm text-slate-600">Emoji</label>
              <input value={emoji} onChange={e=>setEmoji(e.target.value)} className="w-full p-2 border border-slate-200 rounded-md" />
              <label className="text-sm text-slate-600">Color</label>
              <input type="color" value={color} onChange={e=>setColor(e.target.value)} className="w-full p-1 rounded-md" />
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-sky-400 text-white rounded-md">Create Profile</button>
                <button type="button" onClick={()=>setMode('choice')} className="px-4 py-2 bg-slate-100 rounded-md">Back</button>
              </div>
            </form>
          )}

          {mode === 'signin' && (
            <div>
              <div className="mb-3">Sign in with your Google account</div>
              <button onClick={handleSignin} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg">Sign in with Google</button>
              <div className="text-sm text-slate-500 mt-3">If you're an existing user you'll see a "Welcome back" message after sign-in.</div>
              <div className="mt-4"><button onClick={()=>setMode('choice')} className="text-sm text-slate-400">Back</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}