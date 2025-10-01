import React, { useMemo, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

// Build per-exercise series for weight and reps
export default function ProgressCharts({ workouts }){
  const exercises = useMemo(()=>{
    const map = {}
    workouts.slice().reverse().forEach(w => { // chronological
      if (w.type !== 'gym' || !w.exercise) return
      const key = w.exercise
      if (!map[key]) map[key] = []
      map[key].push({ date: new Date(w.date).toLocaleDateString(), weight: Number(w.weight) || null, reps: Number(w.reps) || null })
    })
    // filter only exercises with 2+
    Object.keys(map).forEach(k => { if (map[k].length < 2) delete map[k] })
    return map
  }, [workouts])

  const [selected, setSelected] = useState(Object.keys(exercises)[0] || '')

  return (
    <div className="space-y-4">
      <div className="glass p-4 rounded-md">
        <h3 className="text-lg font-medium mb-3">Progress Charts</h3>
        {Object.keys(exercises).length === 0 && <div className="text-sm text-slate-300">Not enough data. Log a few gym sessions for the same exercise.</div>}

        {Object.keys(exercises).length > 0 && (
          <div>
            <div className="mb-3 flex gap-2">
              <select value={selected} onChange={e=>setSelected(e.target.value)} className="p-2 rounded-md bg-transparent border border-white/10">
                {Object.keys(exercises).map(k => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>

            {selected && (
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <LineChart data={exercises[selected]} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" />
                    <Tooltip />
                    <Line yAxisId="left" type="monotone" dataKey="weight" stroke="#8884d8" activeDot={{ r: 8 }} />
                    <Line yAxisId="right" type="monotone" dataKey="reps" stroke="#82ca9d" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
