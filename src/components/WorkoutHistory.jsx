import React from 'react'

function FeelingBadge({ feeling }){
  const map = { excellent: 'bg-green-500', good: 'bg-blue-500', okay: 'bg-yellow-400', tired: 'bg-red-500' }
  return <span className={`px-2 py-1 rounded-full text-sm ${map[feeling] || 'bg-gray-400'}`}>{feeling}</span>
}

export default function WorkoutHistory({ workouts, setWorkouts }){
  const remove = (id) => {
    setWorkouts(prev => prev.filter(p => p.id !== id))
  }

  return (
    <div className="space-y-3">
      {workouts.length === 0 && <div className="glass p-4 rounded-md">No workouts yet</div>}
      {workouts.map(w => (
        <div key={w.id} className="glass p-4 rounded-md">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">{w.type === 'gym' ? (w.exercise || 'Gym workout') : (w.cardioType || 'Cardio')}</h3>
                <FeelingBadge feeling={w.feeling} />
              </div>
              <div className="text-sm text-slate-300">{new Date(w.date).toLocaleString()} • {w.timeOfDay}</div>
            </div>
            <div className="text-sm text-slate-300">{w.type.toUpperCase()}</div>
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

          <div className="mt-3 flex justify-end">
            <button onClick={()=>remove(w.id)} className="px-3 py-1 bg-red-600 rounded-md">Delete</button>
          </div>
        </div>
      ))}
    </div>
  )
}
