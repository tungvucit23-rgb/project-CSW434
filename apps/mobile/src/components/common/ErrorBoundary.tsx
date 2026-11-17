import React from 'react';
import { ScrollView } from 'react-native';
import { Button, C, Notice, Txt } from '../../ui';
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, gap: 20, backgroundColor: C.bg }}><Txt bold size={24}>Cùng bắt đầu lại nhé.</Txt><Notice warning>Giao diện gặp sự cố. Mở lại ứng dụng; dữ liệu đã lưu trên máy chủ không bị thay đổi.</Notice><Button label="Thử mở lại giao diện" onPress={() => this.setState({ failed: false })} /></ScrollView>;
  }
}
