import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from '@/components/shared/SafeLinearGradient';
import { SkeletonInline } from '@/components/skeleton/Skeleton';
import colors from '@/constants/colors';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLoading?: boolean;
  disableClose?: boolean;
  variant?: 'primary' | 'danger';
};

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Xac nhan',
  cancelText = 'Huy',
  onConfirm,
  onCancel,
  confirmLoading = false,
  disableClose = false,
  variant = 'primary',
}: ConfirmDialogProps) {
  const isDanger = variant === 'danger';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!disableClose) {
          onCancel();
        }
      }}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (!disableClose) {
              onCancel();
            }
          }}
        />

        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, styles.buttonGhost]}
              onPress={onCancel}
              disabled={disableClose}
            >
              <Text style={styles.buttonGhostText}>{cancelText}</Text>
            </Pressable>

            <Pressable
              style={[
                styles.button,
                isDanger ? styles.buttonDanger : styles.buttonPrimary,
              ]}
              onPress={onConfirm}
              disabled={disableClose}
            >
              {!isDanger ? (
                <LinearGradient
                  colors={colors.gradient.primary}
                  start={colors.gradient.start}
                  end={colors.gradient.end}
                  style={StyleSheet.absoluteFillObject}
                />
              ) : null}
              {confirmLoading ? (
                <SkeletonInline width={52} height={12} />
              ) : (
                <Text style={styles.buttonSolidText}>{confirmText}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2, 6, 23, 0.52)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    marginTop: 10,
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  button: {
    minWidth: 92,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  buttonPrimary: {
    backgroundColor: colors.secondary,
  },
  buttonDanger: {
    backgroundColor: '#dc2626',
  },
  buttonGhostText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  buttonSolidText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
