import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'

/**
 * Route transition (§65). Each page freezes the outlet it was created with; otherwise the exiting page would
 * re-render the *new* route during its exit animation, creating a short-lived duplicate that swallows user input.
 */
function Frozen() {
  const outlet = useOutlet()
  const [frozen] = useState(outlet)
  return frozen
}

export function AnimatedOutlet() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
        <Frozen />
      </motion.div>
    </AnimatePresence>
  )
}
