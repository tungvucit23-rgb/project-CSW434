import { leafletJs, leafletCss, clusterJs, clusterCss } from "./vendor/bundled";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Button, Notice } from '../ui';
import { mappable, TravelMapProps, validRadar } from './model';

// The sandbox has no same-origin privileges. Messages are accepted only from this iframe.
const documentHtml = `<!doctype html><html lang="vi"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${leafletCss}</style><style>${clusterCss}</style><style>html,body,#map{height:100%;margin:0;background:#e8efe6;font:13px system-ui}.pin{display:flex;align-items:center;justify-content:center;background:#18735c;border:2px solid white;border-radius:50%;color:white;width:30px;height:30px;box-shadow:0 2px 7px #173d3540;font-size:16px}.ranked{background:#3E7D9D}.selected{background:#173d35;border:3px solid #e9b86c;transform:scale(1.2)}.cluster{background:#fff;border:3px solid #18735c;color:#173d35;border-radius:50%;display:flex;align-items:center;justify-content:center;width:36px;height:36px;font-weight:700;box-shadow:0 2px 8px #173d3530}.leaflet-control-zoom{margin-top:280px!important}.leaflet-control-attribution{font-size:10px}</style></head><body><div id="map" role="application" aria-label="Bản đồ điểm du lịch"></div><script>${leafletJs}</script><script>${clusterJs}</script><script>
const map=L.map('map',{zoomControl:true}).setView([11.9404,108.4583],12);
map.zoomControl.setPosition('topright');const base=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',maxZoom:19}).addTo(map);
const send=(type,extra={})=>parent.postMessage({channel:'di-chung-map',type,...extra},'*');
base.on('tileload',()=>send('tileloaded'));base.on('tileerror',()=>send('tileerror'));base.on('load',()=>send('tilesloaded'));
const clusters=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:48,disableClusteringAtZoom:17,iconCreateFunction:c=>L.divIcon({html:'<span class="cluster">'+c.getChildCount()+'</span>',className:'',iconSize:[42,42]})}).addTo(map);
const selectedLayer=L.layerGroup().addTo(map);const markers=new Map();const routeLayer=L.layerGroup().addTo(map);let routeSignature='';let cityId='',lastSelected='',lastFit=-1,lastFocus=-1,radar=null,radarUrl='';
const symbol=p=>/bảo tàng/i.test(p.name)?'▣':/cafe|cà phê|ẩm thực/i.test(p.category)?'☕':/văn hóa/i.test(p.category)?'⌂':/hồ |thác|biển/i.test(p.name)?'≈':/núi|đồi/i.test(p.name)?'△':/giải trí|tham quan/i.test(p.category)?'◇':'♧';
window.addEventListener('message',e=>{if(e.source!==parent||e.data?.channel!=='di-chung-map'||e.data.type!=='update')return;const d=e.data;const wanted=new Set(d.places.map(p=>p.id));
for(const [id,entry] of markers){if(!wanted.has(id)){(entry.standalone?selectedLayer:clusters).removeLayer(entry.marker);markers.delete(id);}}
for(const p of d.places){const selected=p.id===d.selectedId;const label=Number(d.markerLabels?.[p.id])||0;const signature=JSON.stringify([selected,label,p.name,p.category,p.latitude,p.longitude]);const old=markers.get(p.id);if(old&&old.signature===signature)continue;
const icon=L.divIcon({html:'<span class="pin '+(selected?'selected':label?'ranked':'')+'">'+(label||symbol(p))+'</span>',className:'',iconSize:[36,36],iconAnchor:[18,18]});let m;
if(old){m=old.marker;m.options.title=p.name;(old.standalone?selectedLayer:clusters).removeLayer(m);m.setIcon(icon);m.setZIndexOffset(selected?1000:0);}else{m=L.marker([p.latitude,p.longitude],{icon,title:p.name,alt:p.name,zIndexOffset:selected?1000:0});const label=document.createElement('span');label.textContent=p.name;m.bindTooltip(label);m.on('click',()=>send('select',{id:p.id}));}
((selected||label)?selectedLayer:clusters).addLayer(m);markers.set(p.id,{marker:m,selected,signature,standalone:selected||!!label});}
const routeKey=JSON.stringify(d.routeSegments||[]);if(routeKey!==routeSignature){routeSignature=routeKey;routeLayer.clearLayers();if(d.routeSegments?.length)L.polyline(d.routeSegments.map(segment=>segment.map(p=>[p.latitude,p.longitude])),{color:'#3E7D9D',weight:3,dashArray:'8 6',opacity:.85}).addTo(routeLayer);}
if(cityId!==d.city.id||lastFit!==d.fitKey){cityId=d.city.id;lastFit=d.fitKey;lastSelected='';if(d.places.length>1)map.fitBounds(d.places.map(p=>[p.latitude,p.longitude]),{paddingTopLeft:[45,150],paddingBottomRight:[45,220],maxZoom:14});else map.setView([d.city.latitude,d.city.longitude],12);}
const focus=d.places.find(p=>p.id===d.selectedId);if(focus&&(lastSelected!==d.selectedId||lastFocus!==d.focusKey)){lastSelected=d.selectedId;lastFocus=d.focusKey;map.stop();if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)map.setView([focus.latitude,focus.longitude],16,{animate:false});else map.flyTo([focus.latitude,focus.longitude],16,{duration:.65});}if(!d.selectedId)lastSelected='';
if(d.radarUrl!==radarUrl){if(radar)map.removeLayer(radar);radarUrl=d.radarUrl;if(radarUrl){radar=L.tileLayer(radarUrl,{opacity:.6,maxNativeZoom:7,maxZoom:19,attribution:'RainViewer · radar quá khứ'}).addTo(map);radar.on('tileerror',()=>send('radarerror'));}else radar=null;}
});const resizeObserver=new ResizeObserver(()=>{if(document.body.clientWidth>0&&document.body.clientHeight>0)map.invalidateSize({animate:false});});resizeObserver.observe(document.body);window.addEventListener('pagehide',()=>{resizeObserver.disconnect();map.stop();map.remove();},{once:true});send('ready');
</script></body></html>`;
export default function TravelMap(props: TravelMapProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(props); latest.current = props;
  const payload = useMemo(() => ({ channel: 'di-chung-map', type: 'update', city: props.city, places: props.places.filter(mappable), selectedId: props.selectedId, fitKey: props.fitKey || 0, focusKey: props.focusKey || 0, markerLabels: props.markerLabels || {}, routeSegments: props.routeSegments || [], radarUrl: validRadar(props.radar, props.frameIndex) ? `${props.radar!.host}${props.radar!.frames[props.frameIndex || 0].path}/256/{z}/{x}/{y}/2/1_1.png` : '' }), [props.city, props.places, props.selectedId, props.fitKey, props.focusKey, props.markerLabels, props.routeSegments, props.radar, props.frameIndex]);
  useEffect(() => {
    const listen = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || e.data?.channel !== 'di-chung-map') return;
      if (e.data.type === 'ready') { setReady(true); setError(''); }
      if (e.data.type === 'tileloaded') setTilesLoaded(true);
      if (e.data.type === 'select' && latest.current.places.some(p => p.id === e.data.id)) latest.current.onSelect(e.data.id);
      if (e.data.type === 'tileerror') setError('Không tải được nền bản đồ. Kiểm tra kết nối rồi thử lại.');
      if (e.data.type === 'radarerror') setError('Không tải được tile radar; không suy ra là trời không mưa.');
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);
  useEffect(() => { if (ready) ref.current?.contentWindow?.postMessage(payload, '*'); }, [ready, payload]);
  useEffect(() => { const t = setTimeout(() => { if (!ready) setError('Không tải được thư viện bản đồ. Thử tải lại; danh sách điểm đến vẫn hoạt động.'); }, 18000); return () => clearTimeout(t); }, [ready, attempt]);
  useEffect(() => { if (!ready || tilesLoaded) return; const t = setTimeout(() => setError('Chưa tải được nền bản đồ. Marker và danh sách vẫn hoạt động; kiểm tra kết nối rồi thử lại.'), 18000); return () => clearTimeout(t); }, [ready, tilesLoaded, attempt]);
  return <View style={{ flex: 1 }}>
    {React.createElement('iframe', { key: attempt, ref, title: 'Bản đồ du lịch tương tác', srcDoc: documentHtml, sandbox: 'allow-scripts allow-popups', style: { width: '100%', height: '100%', border: 0 } })}
    {(!ready || error) && <View style={{ position: 'absolute', bottom: 30, left: 20, right: 20, maxWidth: 440, gap: 8 }}><Notice warning={!!error}>{error || 'Đang tải bản đồ…'}</Notice>{!!error && <Button label="Thử lại bản đồ" onPress={() => { setReady(false); setTilesLoaded(false); setError(''); setAttempt(n => n + 1); }} />}</View>}
  </View>;
}


