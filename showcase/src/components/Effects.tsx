import { EffectComposer, Bloom, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

interface EffectsProps {
  importanceSampling?: boolean
}

export function Effects({ importanceSampling = true }: EffectsProps) {
  return (
    <EffectComposer>
      <Bloom
        blendFunction={BlendFunction.ADD}
        intensity={0.8}
        width={300}
        height={300}
        kernelSize={5}
        luminanceThreshold={0.25}
        luminanceSmoothing={0.05}
        importanceSampling={importanceSampling}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={[0.0002, 0.0005]}
      />
    </EffectComposer>
  )
}