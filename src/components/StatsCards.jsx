import React from 'react'

export default function StatsCards({ stats }){
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="p-3 glass rounded-md">
        <div className="text-sm text-slate-300">Total</div>
        <div className="text-2xl font-bold">{stats.total}</div>
      </div>
      <div className="p-3 glass rounded-md">
        <div className="text-sm text-slate-300">This week</div>
        <div className="text-2xl font-bold">{stats.week}</div>
      </div>
      <div className="p-3 glass rounded-md">
        <div className="text-sm text-slate-300">Gym</div>
        <div className="text-2xl font-bold">{stats.gym}</div>
      </div>
      <div className="p-3 glass rounded-md">
        <div className="text-sm text-slate-300">Cardio</div>
        <div className="text-2xl font-bold">{stats.cardio}</div>
      </div>
    </div>
  )
}
