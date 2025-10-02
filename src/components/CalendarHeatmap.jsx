import React, { useMemo } from 'react'

export default function CalendarHeatmap({ workouts }){
  const calendarData = useMemo(()=>{
    const days = []
    for (let i = 34; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      const dayWorkouts = workouts.filter(w => {
        const workoutDate = new Date(w.date).toISOString().split('T')[0]
        return workoutDate === dateStr
      })
      const today = new Date().toISOString().split('T')[0]
      days.push({
        date: dateStr,
        displayDate: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        dayOfWeek: date.getDay(),
        workoutCount: dayWorkouts.length,
        isToday: dateStr === today
      })
    }
    return days
  }, [workouts])

  return (
    <div className="lg:col-span-3 bg-white/10 backdrop-blur rounded-lg p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Workout Consistency - Last 30 Days</h2>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {['S','M','T','W','T','F','S'].map((d,i)=> (
          <div key={i} className="text-center text-sm text-gray-400">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {calendarData.map(day => (
          <div
            key={day.date}
            className={`rounded flex items-center justify-center ${day.workoutCount > 0 ? 'bg-green-600' : 'bg-gray-700'} ${day.isToday ? 'ring-2 ring-purple-500' : ''} hover:opacity-80 transition cursor-pointer w-8 h-8 md:w-10 md:h-10`}
            title={`${day.displayDate}: ${day.workoutCount > 0 ? day.workoutCount + ' workout' + (day.workoutCount > 1 ? 's' : '') : 'Rest day'}`}
          />
        ))}
      </div>

      <div className="flex gap-4 mt-4 text-sm">
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-green-600 rounded"></div><span className="text-gray-300">Workout day</span></div>
        <div className="flex items-center gap-2"><div className="w-4 h-4 bg-gray-700 rounded"></div><span className="text-gray-300">Rest day</span></div>
      </div>
    </div>
  )
}
