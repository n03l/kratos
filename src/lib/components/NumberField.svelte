<script lang="ts">
  import { clampNumber } from '../logic/limits';

  // A number field that only ever reports a value within [min, max]; empty or invalid input restores the value.
  let {
    label, value, min, max, step = 1, integer = true, onvalue,
  }: { label: string; value: number; min: number; max: number; step?: number; integer?: boolean; onvalue: (v: number) => void } = $props();

  function commit(input: HTMLInputElement) {
    const v = clampNumber(input.valueAsNumber, min, max, value, integer);
    input.value = String(v);
    if (v !== value) onvalue(v);
  }
</script>

<label class="field">
  <span>{label}</span>
  <input autocomplete="off" class="input num" type="number" inputmode={integer ? 'numeric' : 'decimal'} {min} {max} {step} {value}
    onchange={(e) => commit(e.currentTarget)} />
</label>
