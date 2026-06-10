"use client"

import * as React from "react"
import { Slider } from "@base-ui/react/slider"
import { cn } from "@/lib/utils"

const StyledSlider = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Slider.Root>
>(({ className, ...props }, ref) => (
  <Slider.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <Slider.Control className="relative flex w-full items-center">
      <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-primary/20">
        <Slider.Indicator className="absolute h-full bg-primary" />
      </Slider.Track>
      <Slider.Thumb className="block size-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </Slider.Control>
  </Slider.Root>
))
StyledSlider.displayName = "Slider"

export { StyledSlider as Slider }
