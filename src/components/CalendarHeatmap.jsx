import React, { useMemo } from 'react'

// Compact 30-day single-row heatmap
export default function CalendarHeatmap({ workouts = [] }){
  const days = useMemo(()=>{
    const out = []
    const today = new Date()
    for (let i = 29; i >= 0; i--){
      const d = new Date()
      d.setDate(today.getDate() - i)
      const dateStr = d.toISOString().split('T')[0]
      const count = (workouts || []).filter(w => {
        if (!w || !w.date) return false
        return new Date(w.date).toISOString().split('T')[0] === dateStr
      }).length
      out.push({ date: dateStr, displayDate: d.toLocaleDateString(), workoutCount: count, isToday: dateStr === today.toISOString().split('T')[0] })
    }
    return out
  }, [workouts])

  return (
    <div className="w-full bg-white/6 backdrop-blur rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Last 30 days</h3>
        <div className="text-xs text-gray-300">Green = workout</div>
      </div>

      <div className="flex gap-1">
        {days.map(d => (
          <div
            key={d.date}
            title={`${d.displayDate}: ${d.workoutCount > 0 ? d.workoutCount + (d.workoutCount>1? ' workouts':' workout') : 'Rest day'}`}
            className={`rounded-sm transition-all cursor-default ${d.workoutCount > 0 ? 'bg-green-600' : 'bg-gray-700'} ${d.isToday ? 'ring-2 ring-purple-500' : ''}`}
            style={{ width: 20, height: 20 }}
          />
        ))}
      </div>
    </div>
  )
}
