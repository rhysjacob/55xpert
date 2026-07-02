// Moderate front-end damage on the same Kia, then 4 framings:
// plate close-up (on the damaged car) + 3 damage angles. All same car + damage.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const OUT = new URL('../../test-images/', import.meta.url).pathname;
const client = new BedrockRuntimeClient({ region: 'us-west-2' });
const INPAINT = 'us.stability.stable-image-inpaint-v1:0';
// Preserve the clean full-car render so repeated tweaks always start from it.
if (!existsSync(OUT + '_clean_base.png')) copyFileSync(OUT + '01_registration_plate.png', OUT + '_clean_base.png');
const base = readFileSync(OUT + '_clean_base.png').toString('base64');
function py(code) { execFileSync('python3', ['-c', code]); }

// Smaller mask (lower front bumper only — leaves the number plate readable) + moderate prompt.
py(`from PIL import Image,ImageDraw
m=Image.new('L',(1536,1536),0)
ImageDraw.Draw(m).polygon([(870,900),(1230,900),(1270,1110),(850,1110)],fill=255)
m.save('${OUT}_mask.png')`);
const mask = readFileSync(OUT + '_mask.png').toString('base64');

const res = await client.send(new InvokeModelCommand({
  modelId: INPAINT, contentType: 'application/json', accept: 'application/json',
  body: JSON.stringify({
    image: base, mask,
    prompt: 'moderate cosmetic damage to the front bumper: a dent and deep scratches with scuffed, '
      + 'cracked paint, photorealistic, minor accident damage',
    output_format: 'png',
  }),
}));
const json = JSON.parse(new TextDecoder().decode(res.body));
const damaged = json.images?.[0] ?? json.body?.images?.[0];
if (!damaged) throw new Error(JSON.stringify(json).slice(0, 200));
writeFileSync(OUT + '_damaged.png', Buffer.from(damaged, 'base64'));
console.log('inpainted moderate damage');

// Framings of the single damaged image.
py(`from PIL import Image
im=Image.open('${OUT}_damaged.png')
def crop(b,name): im.crop(b).resize((1024,1024)).save('${OUT}'+name)
crop((980,640,1430,1010),'01_registration_plate.png')   # close-up on the plate (damaged car)
im.resize((1024,1024)).save('${OUT}02_damage_angle_1.png')  # wide
crop((640,540,1420,1230),'03_damage_angle_2.png')        # medium: front end
crop((840,820,1320,1170),'04_damage_angle_3.png')        # close: bumper damage
print('wrote 4 framings')`);

execFileSync('rm', ['-f', OUT + '_mask.png', OUT + '_damaged.png']);
py(`from PIL import Image
names=['01_registration_plate.png','02_damage_angle_1.png','03_damage_angle_2.png','04_damage_angle_3.png']
ims=[Image.open('${OUT}'+n).resize((400,400)) for n in names]
s=Image.new('RGB',(800,800),'white')
[s.paste(im,((i%2)*400,(i//2)*400)) for i,im in enumerate(ims)]
s.save('${OUT}_contact_sheet.png')`);
console.log('done');
