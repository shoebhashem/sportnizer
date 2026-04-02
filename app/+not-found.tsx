import { Link, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { StyleSheet, View } from "react-native";

export default function NotFoundScreen() {
  const { t } = useTranslation(["screens"]);
  return (
    <>
      <Stack.Screen options={{ title: t("screens:notFound.title") }} />
      <View style={styles.container}>
        <Link href="/" style={styles.button}>
          {t("screens:notFound.goHome")}
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#25292e",
    justifyContent: "center",
    alignItems: "center",
  },

  button: {
    fontSize: 20,
    textDecorationLine: "underline",
    color: "#fff",
  },
});
