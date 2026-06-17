import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('UI error:', error, info) }
  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="m-4 card p-4 border border-rose-500/30">
        <div className="font-semibold text-rose-300 mb-1">Something broke in the UI.</div>
        <div className="text-xs text-slate-400 break-words">{String(this.state.error?.message || this.state.error)}</div>
        <button className="btn-ghost mt-3" onClick={this.reset}>Reset</button>
      </div>
    )
  }
}
