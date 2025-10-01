import React, { useEffect, useMemo, useState, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'
import { Menu, Sun, Trash2, Edit2, PlusCircle } from 'lucide-react'

// New App.jsx implements multi-profile support, per-profile workouts, templates, PRs, rest timer, import/export, edit/delete, and migration

const STORAGE_KEY = 'fitnessTrackerStore' // new combined key
const LEGACY_KEY = 'fitnessTrackerWorkouts' // old key to migrate

const TABS = ['Log Workout', 'History', 'Progress', 'Records', 'Templates']

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
  // selectedProfile controls initial flow: must select before accessing app
  const [selectedProfile, setSelectedProfile] = useState(null)

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
  const currentWorkouts = useMemo(()=> profileWorkouts[currentProfileId] || [], [profileWorkouts, currentProfileId])

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
  useEffect(()=>{
    try{
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw){
        const parsed = JSON.parse(raw)
        setProfiles(parsed.profiles || [])
        setCurrentProfileId(parsed.currentProfileId || (parsed.profiles && parsed.profiles[0] && parsed.profiles[0].id))
        setProfileWorkouts(parsed.profileWorkouts || {})
        setProfileTemplates(parsed.profileTemplates || {})
      } else {
        // Try migrating legacy key
        const legacy = localStorage.getItem(LEGACY_KEY)
        if (legacy){
          try{
            const workouts = JSON.parse(legacy)
            const defaultId = uid('profile-')
            const defaultProfile = { id: defaultId, name: 'Default', color:'#7c3aed', emoji:'💪', createdAt: new Date().toISOString() }
            setProfiles([defaultProfile])
            setCurrentProfileId(defaultId)
            setProfileWorkouts({ [defaultId]: (Array.isArray(workouts) ? workouts.map((w,i) => ({ id: w.id || (Date.now()+i).toString(), ...w })) : []) })
            setProfileTemplates({})
            // Save migrated structure
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles:[defaultProfile], currentProfileId: defaultId, profileWorkouts:{ [defaultId]: workouts }, profileTemplates:{} }))
            toast('Migrated legacy workouts into Default profile')
          } catch(e){
            console.error('Failed to migrate legacy data', e)
          }
        } else {
          // No profiles: create a starter profile
          const id = uid('profile-')
          const starter = { id, name: 'You', color: '#7c3aed', emoji: '💪', createdAt: new Date().toISOString() }
          setProfiles([starter])
          setCurrentProfileId(id)
          setProfileWorkouts({ [id]: [] })
          setProfileTemplates({ [id]: [] })
          // Save
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles:[starter], currentProfileId:id, profileWorkouts:{ [id]: [] }, profileTemplates:{ [id]: [] } }))
        }
      }
    }catch(e){
      console.error('Error loading storage', e)
    }
  }, [])

  // Save storage whenever core pieces change
  useEffect(()=>{
    try{
      const payload = { profiles, currentProfileId, profileWorkouts, profileTemplates }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    }catch(e){
      console.error('Error saving storage', e)
    }
  }, [profiles, currentProfileId, profileWorkouts, profileTemplates])

  // CRUD: add/update/delete workout for current profile
  function addWorkoutForCurrent(w){
    const id = uid('w-')
    const payload = { ...w, id, date: new Date().toISOString(), timeOfDay: timeOfDay() }
    setProfileWorkouts(pw => ({ ...pw, [currentProfileId]: [payload, ...(pw[currentProfileId] || [])] }))
    toast('Workout added')
  }

  function updateWorkoutForCurrent(updated){
    setProfileWorkouts(pw => ({ ...pw, [currentProfileId]: (pw[currentProfileId] || []).map(w => w.id === updated.id ? { ...w, ...updated } : w) }))
    toast('Workout updated')
  }

  function deleteWorkoutForCurrent(id){
    if (!confirm('Delete this workout? This cannot be undone.')) return
    setProfileWorkouts(pw => ({ ...pw, [currentProfileId]: (pw[currentProfileId] || []).filter(w => w.id !== id) }))
    toast('Workout deleted')
  }

  // Profiles: add / select
  function createProfile(name, color, emoji){
    const id = uid('profile-')
    const p = { id, name, color, emoji, createdAt: new Date().toISOString() }
    setProfiles(ps => [...ps, p])
    setProfileWorkouts(pw => ({ ...pw, [id]: [] }))
    setProfileTemplates(pt => ({ ...pt, [id]: [] }))
    // set current profile and also mark it as selected so user enters app
    setCurrentProfileId(id)
    setSelectedProfile(p)
    setShowProfileSelector(false)
    toast('Profile created')
  }

  function switchProfile(id){
    setCurrentProfileId(id)
    setShowProfileSelector(false)
    toast('Switched profile')
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
  function handleSubmit(e){
    e.preventDefault()
    // basic validation
    if (type === 'gym'){
      if (!form.exercise) return alert('Exercise required')
      if (!form.sets) return alert('Sets required')
      if (!form.reps) return alert('Reps required')
    }
    const payload = { ...form, type }
    if (editWorkoutId){
      updateWorkoutForCurrent({ ...payload, id: editWorkoutId })
      setEditWorkoutId(null)
    } else {
      addWorkoutForCurrent(payload)
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
              <div className="p-3 flex flex-col items-center justify-center border-dashed border-2 border-white/10 rounded-md">
                <AddProfileForm onCreate={(name,color,emoji)=>createProfile(name,color,emoji)} />
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={()=>setShowProfileSelector(false)} className="px-3 py-2 bg-slate-700 rounded-md">Close</button>
            </div>
          </div>
        </div>
      )}

      <header className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Menu className="w-6 h-6 text-white/80" />
          <h1 className="text-2xl font-semibold">Fitness Workout Tracker</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* profile switcher */}
          {currentProfile && (
            <div className="flex items-center gap-2">
              <button onClick={()=>setShowProfileSelector(true)} className="flex items-center gap-2 glass p-2 rounded-md" style={{ borderColor: currentProfile.color }}>
                <span style={{ background: currentProfile.color }} className="w-6 h-6 flex items-center justify-center rounded-full">{currentProfile.emoji}</span>
                <span className="font-medium">{currentProfile.name}</span>
              </button>
              <button onClick={()=>{ setSelectedProfile(null); setTab('Log Workout') }} className="glass p-2 rounded-md">Switch Profile</button>
            </div>
          )}
          <button className="glass p-2 rounded-md"><Sun className="w-5 h-5 text-yellow-300"/></button>
        </div>
      </header>

      <nav className="flex gap-2 mb-6">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-md glass transition-smooth ${tab===t? 'ring-2':''}`} style={currentProfile? { boxShadow: `0 0 0 2px ${currentProfile.color}22` } : {}}>
            {t}
          </button>
        ))}
      </nav>

      <main className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2">
          {tab === 'Log Workout' && (
            <div className="glass p-4 rounded-md">
              <h2 className="text-xl font-semibold mb-3">{editWorkoutId ? 'Edit Workout' : 'Log Workout'}</h2>
              <div className="flex gap-2 mb-4">
                <button onClick={()=>setType('gym')} className={`px-3 py-2 rounded-md ${type==='gym' ? 'bg-purple-600':''}`}>Gym</button>
                <button onClick={()=>setType('cardio')} className={`px-3 py-2 rounded-md ${type==='cardio' ? 'bg-purple-600':''}`}>Cardio</button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {type === 'gym' ? (
                  <>
                    <div>
                      <label className="block text-sm">Exercise name *</label>
                      <input value={form.exercise} onChange={e=>setForm({...form, exercise:e.target.value})} className="w-full mt-1 p-2 rounded-md bg-transparent border border-white/10" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
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
                      <div className="flex items-end gap-2">
                        <button type="button" onClick={() => {
                          // suggest least trained body part in last 10
                          const last10 = currentWorkouts.slice(0,10)
                          const counts = { Chest:0, Back:0, Shoulders:0, Arms:0, Legs:0, Core:0, 'Full Body':0 }
                          last10.forEach(w => { if (w.type==='gym' && w.bodyPart) counts[w.bodyPart] = (counts[w.bodyPart]||0)+1 })
                          const sorted = Object.entries(counts).sort((a,b)=>a[1]-b[1])
                          setForm(f => ({ ...f, bodyPart: sorted[0][0] }))
                        }} className="px-2 py-1 bg-slate-700 rounded-md">Suggest</button>
                        <button type="button" onClick={() => {
                          // repeat last gym
                          const last = currentWorkouts.find(w => w.type==='gym')
                          if (!last) return toast('No previous gym workout')
                          setForm({ exercise: last.exercise || '', bodyPart: last.bodyPart || 'Chest', sets: last.sets || '', reps: last.reps || '', weight: last.weight || '', duration: last.duration || '', notes: last.notes || '', feeling: last.feeling || 'good', cardioType: 'running', distance:'', time:'' })
                        }} className="px-2 py-1 bg-slate-700 rounded-md">Repeat Last</button>
                      </div>
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
                  <button className="px-4 py-2 bg-purple-600 rounded-md" type="submit">{editWorkoutId ? 'Update Workout' : 'Add Workout'}</button>
                  {editWorkoutId && <button type="button" onClick={() => { setEditWorkoutId(null); setForm({ exercise:'', bodyPart:'Chest', sets:'', reps:'', weight:'', duration:'', notes:'', feeling:'good', cardioType:'running', distance:'', time:'' }) }} className="px-3 py-2 bg-slate-700 rounded-md">Cancel</button>}
                  <button type="button" onClick={()=>saveTemplate(prompt('Template name')||'')} className="px-3 py-2 bg-slate-700 rounded-md">Save as Template</button>
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
                      <button onClick={()=>startEditWorkout(w)} className="p-2 rounded-md bg-slate-700"><Edit2/></button>
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

          {tab === 'Records' && (
            <div className="glass p-4 rounded-md">
              <h3 className="text-lg font-medium mb-3">Personal Records</h3>
              <div className="space-y-2">
                {Object.keys(records).length===0 && <div className="text-sm text-slate-300">No PRs yet.</div>}
                {Object.entries(records).map(([ex, r])=> (
                  <div key={ex} className="p-3 rounded-md bg-white/5 flex justify-between items-center">
                    <div>
                      <div className="font-semibold">{ex}</div>
                      <div className="text-sm text-slate-300">{r.weight} — {new Date(r.date).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <button onClick={() => { setTab('Progress'); /* could filter chart to exercise */ }} className="px-3 py-1 bg-slate-700 rounded-md">View History</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === 'Templates' && (
            <div className="glass p-4 rounded-md">
              <h3 className="text-lg font-medium mb-3">Templates</h3>
              <div className="space-y-2">
                {(profileTemplates[currentProfileId]||[]).map(t => (
                  <div key={t.id} className="p-3 rounded-md bg-white/5 flex justify-between items-center">
                    <div>
                      <div className="font-semibold">{t.name}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>loadTemplate(t)} className="px-3 py-1 bg-slate-700 rounded-md">Load</button>
                      <button onClick={()=>{
                        setProfileTemplates(pt => ({ ...pt, [currentProfileId]: (pt[currentProfileId]||[]).filter(x=>x.id!==t.id) }))
                        toast('Template deleted')
                      }} className="px-3 py-1 bg-red-600 rounded-md">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
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
                <button onClick={exportAll} className="px-3 py-2 bg-purple-600 rounded-md">Export All</button>
                <label className="flex items-center gap-2">
                  <input type="file" accept="application/json" className="hidden" onChange={(e)=> e.target.files && importAll(e.target.files[0])} />
                  <span className="px-3 py-2 bg-slate-700 rounded-md cursor-pointer">Import</span>
                </label>
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

          <div className="glass p-4 rounded-md">
            <h3 className="text-lg font-medium mb-3">Quick Actions</h3>
            <div className="flex flex-col gap-2">
              <button onClick={()=>setTab('Log Workout')} className="px-3 py-2 bg-slate-700 rounded-md">Log Workout</button>
              <button onClick={()=>setShowProfileSelector(true)} className="px-3 py-2 bg-slate-700 rounded-md">Switch Profile</button>
              <button onClick={()=>startEditWorkout(currentWorkouts[0]||{})} className="px-3 py-2 bg-slate-700 rounded-md">Repeat Last</button>
            </div>
          </div>
        </aside>
      </main>

      {/* Floating rest timer */}
      {timerOpen && (
        <div className="fixed right-4 bottom-6 bg-slate-900 p-4 rounded-md glass">
          <div className="text-lg font-semibold">Rest Timer</div>
          <div className="text-2xl">{Math.floor(timeLeft/60).toString().padStart(2,'0')}:{(timeLeft%60).toString().padStart(2,'0')}</div>
          <div className="flex gap-2 mt-2">
            <button onClick={()=>startTimer(30)} className="px-2 py-1 bg-slate-700 rounded-md">30s</button>
            <button onClick={()=>startTimer(60)} className="px-2 py-1 bg-slate-700 rounded-md">60s</button>
            <button onClick={()=>startTimer(90)} className="px-2 py-1 bg-slate-700 rounded-md">90s</button>
            <button onClick={()=>startTimer(120)} className="px-2 py-1 bg-slate-700 rounded-md">120s</button>
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
    workouts.slice().reverse().forEach(w => {
      if (w.type !== 'gym' || !w.exercise) return
      const key = w.exercise
      if (!map[key]) map[key] = []
      const sets = Number(w.sets) || 1
      const reps = Number(w.reps) || 1
      const weight = Number(w.weight) || 0
      const volume = sets * reps
      const totalLoad = weight * volume
      map[key].push({ date: new Date(w.date).toLocaleDateString(), weight, volume, totalLoad })
    })
    Object.keys(map).forEach(k => { if (map[k].length < 2) delete map[k] })
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
  const cardioByType = useMemo(()=>{
    const map = {}
    workouts.slice().reverse().forEach(w => {
      if (w.type !== 'cardio') return
      const t = w.cardioType || 'other'
      if (!map[t]) map[t] = []
      const dist = Number(w.distance) || null
      const time = Number(w.time) || null
      const pace = (dist && time) ? (time / dist) : null
      map[t].push({ date: new Date(w.date).toLocaleDateString(), distance: dist, time: time, pace })
    })
    Object.keys(map).forEach(k => { if (map[k].length < 2) delete map[k] })
    return map
  }, [workouts])

  const types = Object.keys(cardioByType)
  if (types.length === 0) return <div className="text-sm text-slate-300">Log 2+ cardio sessions to see progress.</div>

  return (
    <div className="space-y-6">
      {types.map(t => (
        <div key={t} className="glass p-4 rounded-md">
          <h4 className="font-semibold mb-2">{t} — Last {cardioByType[t].length} sessions</h4>
          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={cardioByType[t]} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line dataKey="distance" stroke="#8b5cf6" name="Distance (km)" />
                <Line dataKey="time" stroke="#ec4899" name="Time (min)" />
                <Line dataKey="pace" stroke="#06b6d4" name="Pace (min/km)" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
    </div>
  )
}

// Full-screen Profile Selection Screen
function ProfileSelectionScreen({ profiles, profileWorkouts, onCreate, onSelectProfile }){
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'linear-gradient(135deg,#0f172a,#1e293b 40%, #7c3aed 100%)' }}>
      <div className="w-full max-w-5xl bg-white/5 rounded-xl p-6">
        <h2 className="text-2xl font-semibold mb-4 text-center">Select Profile</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {profiles.map(p => (
            <div key={p.id} onClick={()=>onSelectProfile(p)} className="p-6 rounded-xl cursor-pointer hover:scale-105 transition-transform" style={{ background: `linear-gradient(135deg, ${p.color}33, #00000022)` }}>
              <div className="text-4xl">{p.emoji}</div>
              <div className="font-semibold text-xl mt-2">{p.name}</div>
              <div className="text-sm text-slate-300 mt-1">{(profileWorkouts[p.id]||[]).length} total workouts</div>
            </div>
          ))}
          <div className="p-6 rounded-xl flex flex-col items-center justify-center border-dashed border-2 border-white/10">
            <div className="mb-2">Create New Profile</div>
            <AddProfileForm onCreate={(name,color,emoji)=>onCreate(name,color,emoji)} />
          </div>
        </div>
      </div>
    </div>
  )
}

