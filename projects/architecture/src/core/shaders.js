// 铅笔排线、淡彩与线段动画着色器。保留 Three.js 的 clipping chunks。
export const VS = `#include <common>
#include <clipping_planes_pars_vertex>
attribute float aBuild;uniform float uProg;varying float vT,vWY;attribute vec3 aCol;varying vec3 vCol;
varying vec3 vN;
void main(){vN=normalize(mat3(modelMatrix)*normal);vCol=aCol;float t=clamp((uProg-aBuild)/.035,0.,1.);vT=t;vec3 p=position;float e=1.-t;p.y+=e*e*7.;
vec4 wp=modelMatrix*vec4(p,1.0);vWY=wp.y;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;
#include <clipping_planes_vertex>
}`;

export const FS = `#include <common>
#include <clipping_planes_pars_fragment>
uniform vec3 uLight,uInk,uPaper;uniform float uTone,uBoil,uDPR,uOpen,uGrow,uIsGrow,uHang,uIsHang,uWash,uWashY;varying vec3 vN,vCol;varying float vT,vWY;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float hl(vec2 c,float a,float sp,float w){vec2 d=vec2(cos(a),sin(a));float t=dot(c,vec2(-d.y,d.x))/sp;t+=(vn(c*.035+uBoil*7.13)-.5)*.9;
  float seg=vn(vec2(dot(c,d)*.07,floor(t)*3.1)+uBoil*1.7);float f=abs(fract(t)-.5)*2.;return (1.-smoothstep(w,w+.25,f))*smoothstep(.12,.34,seg);}
void main(){
#include <clipping_planes_fragment>
  if(vT<=0.||h21(floor(gl_FragCoord.xy))>vT*1.4||(uIsGrow>.5&&vWY>uGrow)||(uIsHang>.5&&vWY<uHang))discard;
  vec3 n=normalize(vN);bool back=!gl_FrontFacing;if(back)n=-n;
  float dif=max(dot(n,uLight),0.);float lum=.2+.6*dif+.2*(n.y*.5+.5)-uTone;
  vec2 c=gl_FragCoord.xy/uDPR;float ink=0.;
  ink=max(ink,hl(c,.8,6.,.18)*(1.-smoothstep(.72,.88,lum))*.5);
  ink=max(ink,hl(c,-.55,5.,.18)*(1.-smoothstep(.48,.64,lum))*.6);
  ink=max(ink,hl(c,.12,4.,.2)*(1.-smoothstep(.28,.42,lum))*.7);
  ink*=1.-.62*uWash;
  if(back&&uOpen<.5)ink=max(ink,max(hl(c,.785,2.8,.3),hl(c,-.785,2.8,.3))*.85);
  vec3 base=uPaper+(vn(c*.7)-.5)*.045;
  if(uWash>.001){float wy=uWashY+(vn(c*.03+3.1)-.5)*5.;float d=uWash*(1.-smoothstep(wy-2.,wy+.5,vWY));
    float bloom=.86+.14*vn(c*.009+7.7);d*=bloom;
    float front=(1.-smoothstep(0.,1.6,abs(vWY-wy)))*step(uWashY,500.);
    vec3 wc=vCol*mix(.76,1.05,lum)*(1.-.22*front)*(.985+.03*vn(c*1.3));if(back&&uOpen<.5)wc*=.85;
    base=mix(base,wc,clamp(d,0.,1.)*.74);}
  vec3 col=mix(base,uInk,ink);gl_FragColor=vec4(col,1.);}`;

export const LVS = `#include <common>
#include <clipping_planes_pars_vertex>
uniform float uSeed,uAmp,uBoil,uProg,uOver;attribute float aBuild;attribute vec3 aOther;varying float vFade;varying float vT,vWY;
float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
void main(){vec3 p=position;vec3 q=p*1.37+uSeed+uBoil*3.1;vec3 dd=position-aOther;float ll=length(dd);if(ll>1e-4)p+=dd/ll*min(uOver,ll*.22)*(.3+h(q+5.3));p+=(vec3(h(q),h(q+11.3),h(q+27.1))-.5)*uAmp;float t=clamp((uProg-aBuild)/.035,0.,1.);vT=t;float e=1.-t;p.y+=e*e*7.;vWY=p.y;
vec4 mvPosition=modelViewMatrix*vec4(p,1.0);vFade=clamp(105./max(1.,-mvPosition.z),.3,1.);mvPosition.xyz*=.9988;gl_Position=projectionMatrix*mvPosition;
#include <clipping_planes_vertex>
}`;

export const LFS = `#include <common>
#include <clipping_planes_pars_fragment>
uniform vec3 uInk;uniform float uAlpha,uGrow,uIsGrow,uHang,uIsHang,uLineK,uWash,uWL,uWashY;varying float vFade;varying float vT,vWY;
void main(){
#include <clipping_planes_fragment>
if(vT<=0.||(uIsGrow>.5&&vWY>uGrow)||(uIsHang>.5&&vWY<uHang))discard;
gl_FragColor=vec4(uInk,uAlpha*vT*vFade*mix(uLineK,uWash*smoothstep(-2.,2.,uWashY-vWY),uWL));}`;
