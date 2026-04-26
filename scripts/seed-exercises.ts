/**
 * Seed exercises_library with 30 popular exercises.
 * Run once: npm run seed
 *
 * Images are stored in Supabase Storage bucket 'exercises-images'.
 * After running, image_urls will be populated from Storage.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const EXERCISES = [
  { external_id: 'ex-01', name_ru: 'Приседания со штангой', name_en: 'Barbell Squat', category: 'Ноги', equipment: 'Штанга' },
  { external_id: 'ex-02', name_ru: 'Жим лёжа', name_en: 'Bench Press', category: 'Грудь', equipment: 'Штанга' },
  { external_id: 'ex-03', name_ru: 'Становая тяга', name_en: 'Deadlift', category: 'Спина', equipment: 'Штанга' },
  { external_id: 'ex-04', name_ru: 'Подтягивания', name_en: 'Pull-ups', category: 'Спина', equipment: 'Турник' },
  { external_id: 'ex-05', name_ru: 'Жим стоя (армейский)', name_en: 'Overhead Press', category: 'Плечи', equipment: 'Штанга' },
  { external_id: 'ex-06', name_ru: 'Тяга штанги в наклоне', name_en: 'Bent-over Row', category: 'Спина', equipment: 'Штанга' },
  { external_id: 'ex-07', name_ru: 'Жим гантелей лёжа', name_en: 'Dumbbell Bench Press', category: 'Грудь', equipment: 'Гантели' },
  { external_id: 'ex-08', name_ru: 'Разведение гантелей лёжа', name_en: 'Dumbbell Fly', category: 'Грудь', equipment: 'Гантели' },
  { external_id: 'ex-09', name_ru: 'Выпады с гантелями', name_en: 'Dumbbell Lunges', category: 'Ноги', equipment: 'Гантели' },
  { external_id: 'ex-10', name_ru: 'Румынская тяга', name_en: 'Romanian Deadlift', category: 'Ноги', equipment: 'Штанга' },
  { external_id: 'ex-11', name_ru: 'Жим ногами', name_en: 'Leg Press', category: 'Ноги', equipment: 'Тренажёр' },
  { external_id: 'ex-12', name_ru: 'Сгибания ног лёжа', name_en: 'Leg Curl', category: 'Ноги', equipment: 'Тренажёр' },
  { external_id: 'ex-13', name_ru: 'Разгибания ног сидя', name_en: 'Leg Extension', category: 'Ноги', equipment: 'Тренажёр' },
  { external_id: 'ex-14', name_ru: 'Подъём на носки стоя', name_en: 'Standing Calf Raise', category: 'Ноги', equipment: 'Тренажёр' },
  { external_id: 'ex-15', name_ru: 'Тяга верхнего блока', name_en: 'Lat Pulldown', category: 'Спина', equipment: 'Тренажёр' },
  { external_id: 'ex-16', name_ru: 'Тяга горизонтального блока', name_en: 'Seated Row', category: 'Спина', equipment: 'Тренажёр' },
  { external_id: 'ex-17', name_ru: 'Гиперэкстензия', name_en: 'Back Extension', category: 'Спина', equipment: 'Тренажёр' },
  { external_id: 'ex-18', name_ru: 'Жим гантелей сидя', name_en: 'Seated Dumbbell Press', category: 'Плечи', equipment: 'Гантели' },
  { external_id: 'ex-19', name_ru: 'Махи гантелями в стороны', name_en: 'Lateral Raise', category: 'Плечи', equipment: 'Гантели' },
  { external_id: 'ex-20', name_ru: 'Махи гантелями в наклоне', name_en: 'Rear Delt Fly', category: 'Плечи', equipment: 'Гантели' },
  { external_id: 'ex-21', name_ru: 'Подъём штанги на бицепс', name_en: 'Barbell Curl', category: 'Руки', equipment: 'Штанга' },
  { external_id: 'ex-22', name_ru: 'Молотки с гантелями', name_en: 'Hammer Curl', category: 'Руки', equipment: 'Гантели' },
  { external_id: 'ex-23', name_ru: 'Французский жим', name_en: 'Skullcrusher', category: 'Руки', equipment: 'Штанга' },
  { external_id: 'ex-24', name_ru: 'Разгибания на трицепс на блоке', name_en: 'Triceps Pushdown', category: 'Руки', equipment: 'Тренажёр' },
  { external_id: 'ex-25', name_ru: 'Отжимания на брусьях', name_en: 'Dips', category: 'Грудь', equipment: 'Брусья' },
  { external_id: 'ex-26', name_ru: 'Отжимания от пола', name_en: 'Push-ups', category: 'Грудь', equipment: 'Без оборудования' },
  { external_id: 'ex-27', name_ru: 'Планка', name_en: 'Plank', category: 'Кор', equipment: 'Без оборудования' },
  { external_id: 'ex-28', name_ru: 'Скручивания', name_en: 'Crunches', category: 'Кор', equipment: 'Без оборудования' },
  { external_id: 'ex-29', name_ru: 'Подъём ног в висе', name_en: 'Hanging Leg Raise', category: 'Кор', equipment: 'Турник' },
  { external_id: 'ex-30', name_ru: 'Велотренажёр', name_en: 'Stationary Bike', category: 'Кардио', equipment: 'Тренажёр' },
]

async function main() {
  console.log('Seeding exercises_library...')

  const { error } = await supabase
    .from('exercises_library')
    .upsert(
      EXERCISES.map(e => ({ ...e, image_urls: [] })),
      { onConflict: 'external_id' }
    )

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  console.log(`✓ Seeded ${EXERCISES.length} exercises`)
  console.log('')
  console.log('Next: upload exercise images to Supabase Storage bucket "exercises-images"')
  console.log('and update image_urls in exercises_library accordingly.')
}

main()
