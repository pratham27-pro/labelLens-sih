import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import VerdictBanner from '../components/VerdictBanner';
import EvidenceImage from '../components/EvidenceImage';
import DeclarationRow from '../components/DeclarationRow';

export default function ResultScreen({ route, navigation }) {
  const { result } = route.params;
  const { status, evidenceImageUri, declarations } = result;
  const compliantCount = declarations.filter((d) => d.status === 'ok').length;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <Text className="text-2xl font-bold text-ink-900 mb-4">Scan Result</Text>

        <VerdictBanner status={status} />

        <View className="mt-6">
          <EvidenceImage uri={evidenceImageUri} declarations={declarations} />
        </View>

        <View className="mt-6">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-lg font-bold text-ink-900">Declarations</Text>
            <Text className="text-sm text-ink-500">
              {compliantCount}/{declarations.length} compliant
            </Text>
          </View>
          {declarations.map((d) => (
            <DeclarationRow key={d.type} declaration={d} />
          ))}
        </View>
      </ScrollView>

      <View className="px-5 pb-4 pt-3 border-t border-ink-100">
        <Pressable
          onPress={() => navigation.popToTop()}
          className="bg-primary-600 rounded-2xl py-4 items-center active:opacity-90"
        >
          <Text className="text-white text-base font-semibold">Scan Again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
