import { leafletJs, leafletCss } from "./map/vendor/bundled";
﻿import React, { useMemo } from "react";
import { View } from "react-native";
import { RadarData } from "./types";
import { Notice } from "./ui";

export default function RadarMap({
  radar,
  latitude,
  longitude,
  frameIndex,
}: {
  radar: RadarData;
  latitude: number;
  longitude: number;
  frameIndex: number;
}) {
  const frame = radar.frames[frameIndex];
  const safe =
    !!frame &&
    /^https:\/\/([a-z0-9-]+\.)*rainviewer\.com$/i.test(radar.host) &&
    /^\/v2\/radar\/[a-z0-9/_-]+$/i.test(frame.path);
  const html = useMemo(() => {
    if (!safe) return "";
    const lat = Number.isFinite(latitude) ? latitude : 11.9404;
    const lon = Number.isFinite(longitude) ? longitude : 108.4583;
    const tile = JSON.stringify(
      `${radar.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`,
    ).replace(/</g, "\\u003c");
    const coverage = /^https:\/\/([a-z0-9-]+\.)*rainviewer\.com\//i.test(
      radar.coverageUrl,
    )
      ? JSON.stringify(radar.coverageUrl).replace(/</g, "\\u003c")
      : "null";
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${leafletCss}</style><style>html,body,#map{height:100%;margin:0;font-family:system-ui}#state{position:absolute;z-index:1000;right:10px;top:10px;background:white;padding:9px 12px;border-radius:8px;font-size:11px;max-width:220px;color:#173D35;box-shadow:0 2px 8px #0002}</style></head><body><div id="map"></div><div id="state">Đang kiểm tra độ phủ tại tâm bản đồ…</div><script>${leafletJs}</script><script>
      const map=L.map('map',{zoomControl:true}).setView([${lat},${lon}],7);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:18}).addTo(map);
      const radar=L.tileLayer(${tile},{attribution:'RainViewer · radar quá khứ',maxNativeZoom:7,maxZoom:18,opacity:.65}).addTo(map);
      radar.on('tileerror',()=>{document.getElementById('state').textContent='Không tải được tile radar. Chưa thể đánh giá vùng mưa.'});
      L.circleMarker([${lat},${lon}],{radius:7,color:'#18735C',fillColor:'#fff',fillOpacity:1,weight:3}).addTo(map).bindPopup('Thành phố của chuyến đi');
      const template=${coverage};
      if(!template){document.getElementById('state').textContent='Chưa có dữ liệu kiểm tra độ phủ.'}else{
        const z=7,n=Math.pow(2,z),xf=(${lon}+180)/360*n,yf=(1-Math.asinh(Math.tan(${lat}*Math.PI/180))/Math.PI)/2*n;
        const url=template.replace('{z}',String(z)).replace('{x}',String(Math.floor(xf))).replace('{y}',String(Math.floor(yf)));
        const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{try{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);const p=c.getContext('2d').getImageData(Math.floor((xf%1)*img.width),Math.floor((yf%1)*img.height),1,1).data;document.getElementById('state').textContent=p[3]===0?'Có dữ liệu phủ radar tại tâm bản đồ. Màu trống không khẳng định trời khô.':'Ngoài vùng phủ radar tại tâm bản đồ. Không diễn giải là không mưa.'}catch(e){document.getElementById('state').textContent='Chưa xác minh độ phủ: trình duyệt không cho đọc coverage mask.'}};img.onerror=()=>document.getElementById('state').textContent='Chưa tải được coverage mask; độ phủ chưa xác minh.';img.src=url;
      }
    </script></body></html>`;
  }, [safe, radar.host, frame?.path, radar.coverageUrl, latitude, longitude]);
  if (!safe)
    return (
      <Notice warning>
        Địa chỉ tile radar chưa hợp lệ hoặc chưa có khung ảnh. Không có dữ liệu
        không có nghĩa là không mưa.
      </Notice>
    );
  return (
    <View style={{ height: 450, overflow: "hidden", borderRadius: 16 }}>
      {React.createElement("iframe", {
        title: "Radar mưa RainViewer",
        srcDoc: html,
        sandbox: "allow-scripts",
        style: { width: "100%", height: "100%", border: 0 },
      })}
    </View>
  );
}

