import React from "react";
import { Platform, View } from "react-native";
import Constants from "expo-constants";
import MapView, { Marker, UrlTile } from "react-native-maps";
import { RadarData } from "./types";
import { Notice, Txt } from "./ui";

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
  if (
    Platform.OS === "android" &&
    Constants.executionEnvironment !== "storeClient" &&
    !Constants.expoConfig?.extra?.nativeMapsConfigured
  )
    return (
      <Notice warning>
        Bản Android standalone chưa cấu hình GOOGLE_MAPS_API_KEY. Bạn vẫn có thể
        xem radar ở bản web; thêm khóa và build lại để dùng bản đồ native.
      </Notice>
    );
  const frame = radar.frames[frameIndex];
  if (
    !frame ||
    !/^https:\/\/([a-z0-9-]+\.)*rainviewer\.com$/i.test(radar.host) ||
    !/^\/v2\/radar\/[a-z0-9/_-]+$/i.test(frame.path)
  )
    return (
      <Notice warning>
        Chưa có tile radar hợp lệ. Không có dữ liệu không có nghĩa là không mưa.
      </Notice>
    );
  return (
    <View style={{ gap: 12 }}>
      <View style={{ height: 430, overflow: "hidden", borderRadius: 16 }}>
        <MapView
          style={{ flex: 1 }}
          maxZoomLevel={18}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: 3,
            longitudeDelta: 3,
          }}
        >
          <UrlTile
            urlTemplate={`${radar.host}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`}
            maximumNativeZ={7}
            maximumZ={18}
            tileSize={256}
            opacity={0.65}
          />
          <Marker
            coordinate={{ latitude, longitude }}
            title="Thành phố chuyến đi"
          />
        </MapView>
      </View>
      <Txt size={11}>© RainViewer · Dữ liệu nền bản đồ theo nhà cung cấp</Txt>
      <Notice warning>
        Độ phủ tại tọa độ này chưa được xác minh trên ứng dụng native. Xem
        coverage mask trên màn hình web; vùng không có màu chưa đủ để kết luận
        trời khô.
      </Notice>
    </View>
  );
}
