import React, { ReactNode, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from './theme/tokens';

export const C = colors;
export const money = (n: number) =>
  `${new Intl.NumberFormat("vi-VN").format(n)}đ`;
export const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });
export const date = (iso: string) =>
  new Date(
    iso.length === 10 ? `${iso}T12:00:00+07:00` : iso,
  ).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
export const shortName = (name: string) =>
  name
    .trim()
    .split(" ")
    .slice(-2)
    .map((x) => x[0])
    .join("")
    .toUpperCase();
export function Icon({
  name,
  size = 22,
  color = C.green,
}: {
  name: keyof typeof Ionicons.glyphMap;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function Txt({
  children,
  size = 14,
  color = C.text,
  bold,
  style,
  selectable,
}: {
  children?: ReactNode;
  size?: number;
  color?: string;
  bold?: boolean;
  style?: StyleProp<TextStyle>;
  selectable?: boolean;
}) {
  return (
    <Text
      selectable={selectable}
      style={[
        {
          fontSize: size,
          color,
          lineHeight: size * 1.55,
          fontWeight: bold ? "700" : "400",
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[{ flexDirection: "row", alignItems: "center", gap: 10 }, style]}
    >
      {children}
    </View>
  );
}
export function Card({
  children,
  style,
  onPress,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}) {
  const inner = <View style={[U.card, style]}>{children}</View>;
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {inner}
    </Pressable>
  ) : (
    inner
  );
}
export function Pill({
  children,
  tone = "green",
}: {
  children: ReactNode;
  tone?: "green" | "amber" | "muted" | "blue";
}) {
  const palette = {
    green: [C.pale, C.green],
    amber: [C.yellow, C.amber],
    muted: ["#EEF0EB", C.muted],
    blue: ["#E8F2F7", C.blue],
  }[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: palette[0],
        borderRadius: 7,
        paddingHorizontal: 9,
        paddingVertical: 4,
      }}
    >
      <Txt size={10} bold color={palette[1]}>
        {children}
      </Txt>
    </View>
  );
}
export function Button({
  label,
  accessibilityLabel,
  onPress,
  icon,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === "primary"
      ? C.green
      : variant === "danger"
        ? C.red
        : variant === "secondary"
          ? C.pale
          : "transparent";
  const color =
    variant === "primary" || variant === "danger" ? C.white : C.green;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingHorizontal: 17,
          paddingVertical: 12,
          minHeight: 44,
          backgroundColor: bg,
          borderRadius: 12,
          opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
          flexDirection: "row",
          gap: 8,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        icon && <Icon name={icon} size={18} color={color} />
      )}
      <Txt size={13} bold color={color}>
        {label}
      </Txt>
    </Pressable>
  );
}
export function Input({
  label,
  value,
  onChange,
  placeholder,
  secure,
  numeric,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  numeric?: boolean;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Txt size={12} bold>
        {label}
      </Txt>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        keyboardType={numeric ? "numeric" : "default"}
        multiline={multiline}
        style={[
          U.input,
          multiline && { minHeight: 90, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
export function Section({
  title,
  subtitle,
  action,
  onAction,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <Row
      style={{
        justifyContent: "space-between",
        marginTop: 6,
        marginBottom: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <Txt size={19} bold color={C.ink}>
          {title}
        </Txt>
        {subtitle && (
          <Txt size={12} color={C.muted}>
            {subtitle}
          </Txt>
        )}
      </View>
      {action && (
        <Pressable accessibilityRole="button" onPress={onAction}>
          <Txt size={12} color={C.green} bold>
            {action} ↗
          </Txt>
        </Pressable>
      )}
    </Row>
  );
}
export function Empty({
  title,
  text,
  action,
  onAction,
  icon = "leaf-outline",
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Card style={{ alignItems: "center", paddingVertical: 35, gap: 10 }}>
      <View style={U.iconCircle}>
        <Icon name={icon} size={28} />
      </View>
      <Txt bold size={17}>
        {title}
      </Txt>
      <Txt
        size={13}
        color={C.muted}
        style={{ textAlign: "center", maxWidth: 420 }}
      >
        {text}
      </Txt>
      {action && onAction && (
        <Button label={action} onPress={onAction} variant="secondary" />
      )}
    </Card>
  );
}
export function Notice({
  children,
  warning = false,
}: {
  children: ReactNode;
  warning?: boolean;
}) {
  return (
    <View
      style={{
        backgroundColor: warning ? "#FFF3D9" : C.pale,
        padding: 14,
        borderRadius: 12,
        flexDirection: "row",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <Icon
        name={warning ? "information-circle-outline" : "leaf-outline"}
        color={warning ? C.amber : C.green}
        size={19}
      />
      <Txt size={12} color={warning ? C.amber : C.text} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}
export function Photo({
  uri,
  height = 150,
  style,
}: {
  uri?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);
  return (
    <View
      style={[
        {
          height,
          backgroundColor: C.mint,
          borderRadius: 14,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      {uri && !failed ? (
        <Image
          accessibilityLabel="Ảnh minh họa điểm đến"
          source={{ uri }}
          resizeMode="cover"
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%" }}
        />
      ) : (
        <Icon name="image-outline" size={32} color="#91B29B" />
      )}
    </View>
  );
}
export function Avatar({
  name,
  color,
  size = 35,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color || C.green,
        alignItems: "center",
        justifyContent: "center",
        borderColor: C.white,
        borderWidth: 2,
      }}
    >
      <Txt bold size={size * 0.3} color="white">
        {shortName(name)}
      </Txt>
    </View>
  );
}
export function MenuRow({
  title,
  text,
  icon,
  onPress,
  end,
}: {
  title: string;
  text?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  end?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: C.line,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={U.iconCircle}>
        <Icon name={icon} size={21} />
      </View>
      <View style={{ flex: 1 }}>
        <Txt size={14} bold>
          {title}
        </Txt>
        {text && (
          <Txt size={12} color={C.muted}>
            {text}
          </Txt>
        )}
      </View>
      {end || <Icon name="chevron-forward" size={17} color={C.muted} />}
    </Pressable>
  );
}
export const U = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: C.line,
  },
  input: {
    backgroundColor: "#FAFBF8",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: C.ink,
    minHeight: 46,
  },
  iconCircle: {
    height: 42,
    width: 42,
    borderRadius: 13,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", gap: 16, flexWrap: "wrap" },
  stack: { gap: 16 },
});
