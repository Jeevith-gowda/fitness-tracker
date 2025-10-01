import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle, ChevronDown } from 'lucide-react'

const BODY_PARTS = ['Chest','Back','Shoulders','Arms','Legs','Core','Full Body']
const FEELINGS = [
  { id: 'excellent', color: 'bg-green-500' },
  { id: 'good', color: 'bg-blue-500' },
  { id: 'okay', color: 'bg-yellow-500' },
  { id: 'tired', color: 'bg-red-500' }
]

function timeOfDay(date = new Date()){
  const h = new Date(date).getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

export default function WorkoutForm({ onAdd, suggestNextBodyPart, workouts }){
  const [type, setType] = useState('gym')
  const [form, setForm] = useState({
    exercise: '', bodyPart: 'Chest', sets: '', reps: '', weight: '', duration: '', notes: '', feeling: 'good', cardioType: 'running', distance: '', time: ''
  })

  // Repeat last gym workout
  const repeatLastGym = () => {
    // workouts are stored newest-first, so find the first gym workout
    const last = workouts.find(w => w.type === 'gym')
    if (!last) return alert('No previous gym workout')
    setType('gym')
    setForm(prev => ({ ...prev,
      exercise: last.exercise || '',
      bodyPart: last.bodyPart || 'Chest',
      sets: last.sets || '',
      reps: last.reps || '',
      weight: last.weight || '',
      duration: last.duration || '',
      notes: last.notes || '',
      feeling: last.feeling || 'good'
    }))
  }

  // Suggest next
  const suggest = () => {
    const bp = suggestNextBodyPart()
    setForm(f => ({ ...f, bodyPart: bp }))
  }

  const validate = () => {
    if (type === 'gym'){
      if (!form.exercise) return 'Exercise name is required'
      if (!form.sets) return 'Sets is required'
      if (!form.reps) return 'Reps is required'
    } else {
      if (!form.cardioType) return 'Cardio type is required'
    }
    return null
  }

  const submit = (e) => {
    e.preventDefault()
    const err = validate()
    if (err) return alert(err)
    const payload = {
      type,
      date: new Date().toISOString(),
      timeOfDay: timeOfDay(),
      ...form
    }
    onAdd(payload)
    // reset some fields
    setForm({ exercise: '', bodyPart: form.bodyPart || 'Chest', sets: '', reps: '', weight: '', duration: '', notes: '', feeling: form.feeling || 'good', cardioType: 'running', distance: '', time: '' })
  }

  return (
    <div className="glass p-4 rounded-md">
      <h2 className="text-xl font-semibold mb-3">Log Workout</h2>
      <div className="flex gap-2 mb-4">
        <button onClick={()=>setType('gym')} className={`px-3 py-2 rounded-md ${type==='gym' ? 'bg-purple-600':''}`}>Gym</button>
        <button onClick={()=>setType('cardio')} className={`px-3 py-2 rounded-md ${type==='cardio' ? 'bg-purple-600':''}`}>Cardio</button>
      </div>

      <form onSubmit={submit} className="space-y-3">
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
                  {BODY_PARTS.map(b=> <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button type="button" onClick={suggest} className="px-2 py-1 bg-slate-700 rounded-md">Suggest</button>
                <button type="button" onClick={repeatLastGym} className="px-2 py-1 bg-slate-700 rounded-md">Repeat Last</button>
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
            {FEELINGS.map(f=> (
              <button key={f.id} type="button" onClick={()=>setForm({...form, feeling:f.id})} className={`px-3 py-1 rounded-full ${f.color} ${form.feeling===f.id? 'ring-2 ring-white':''}`}>
                {f.id}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="px-4 py-2 bg-purple-600 rounded-md" type="submit">Add Workout</button>
          <button type="button" onClick={()=>{
            setForm({ exercise: '', bodyPart: 'Chest', sets: '', reps: '', weight: '', duration: '', notes: '', feeling: 'good', cardioType: 'running', distance: '', time: '' })
          }} className="px-3 py-2 bg-slate-700 rounded-md">Reset</button>
        </div>
      </form>
    </div>
  )
}
