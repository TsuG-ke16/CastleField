# Rebuild delivery WebP from preserved originals. Requires Pillow with libwebp.
from pathlib import Path
from PIL import Image,ImageChops,ImageStat
import math,json
root=Path(__file__).resolve().parents[2];rows=[]
for p in sorted((root/'assets/review/kingdom-fantasy-v3/sources').glob('*.png')):
 im=Image.open(p).convert('RGBA');out=root/'assets/ui/kingdom-v2'/p.with_suffix('.webp').name
 lossless=not p.stem.startswith('skills-');temp=out.with_name(out.stem+'.tmp.webp');im.save(temp,'WEBP',lossless=lossless,quality=95,method=6,exact=False)
 d=Image.open(temp).convert('RGBA');assert im.getchannel('A').tobytes()==d.getchannel('A').tobytes()
 bg=Image.new('RGBA',im.size,'#fff2d2');a=Image.alpha_composite(bg,im).convert('RGB');b=Image.alpha_composite(bg,d).convert('RGB');stat=ImageStat.Stat(ImageChops.difference(a,b));mse=sum(v*v for v in stat.rms)/3;psnr=round(10*math.log10(255**2/mse),2)if mse else None
 if lossless:assert mse==0
 temp.replace(out)
 rows.append({'sheet':p.stem,'originalBytes':p.stat().st_size,'deliveryBytes':out.stat().st_size,'lossless':lossless,'alphaExact':True,'compositedPSNRdB':psnr,'rgbaExact':im.tobytes()==d.tobytes()})
report={'originalBytes':sum(r['originalBytes']for r in rows),'deliveryBytes':sum(r['deliveryBytes']for r in rows),'images':rows};report['reductionPercent']=round((1-report['deliveryBytes']/report['originalBytes'])*100,1)
(root/'assets/review/kingdom-fantasy-v3/optimization.json').write_text(json.dumps(report,indent=2));print({k:v for k,v in report.items()if k!='images'})
